import json
import logging
import time
import uuid
from typing import Any

from pydantic import ValidationError
from sqlalchemy import delete
from sqlmodel import Session, select

from src.backend import config
from src.backend.models import LectureEvent, LectureEventRelation
from src.backend.services.semantic_events.service import (
    list_lecture_events,
    load_source_transcript_segments,
)

from .candidates import generate_question_answer_candidates
from .provider import QuestionAnswerLinkProvider
from .schemas import (
    ProviderLink,
    QuestionAnswerProcessingResult,
    RelationType,
)

logger = logging.getLogger(__name__)


class RelationValidationError(ValueError):
    pass


class LinkProviderPayloadError(ValueError):
    pass


def validate_relation_events(
    source: LectureEvent,
    target: LectureEvent,
    *,
    video_id: uuid.UUID,
) -> None:
    if source.id == target.id:
        raise RelationValidationError("A relation cannot link an event to itself.")
    if source.video_id != video_id or target.video_id != video_id:
        raise RelationValidationError("Both events must belong to the same lecture.")
    if source.event_type != "QUESTION" or target.event_type != "ANSWER":
        raise RelationValidationError("Only QUESTION to ANSWER relations are valid.")
    if target.start_time < source.start_time:
        raise RelationValidationError("The answer must start at or after the question.")
    if not source.source_segment_ids or not target.source_segment_ids:
        raise RelationValidationError("Both events must have source evidence.")


def list_event_relations(
    session: Session,
    video_id: str,
) -> list[LectureEventRelation]:
    lesson_uuid = uuid.UUID(str(video_id))
    statement = (
        select(LectureEventRelation)
        .where(LectureEventRelation.video_id == lesson_uuid)
        .order_by(LectureEventRelation.created_at, LectureEventRelation.id)
    )
    return list(session.exec(statement).all())


def _decode_link_items(payload: Any) -> list[Any]:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise LinkProviderPayloadError("provider response is not valid JSON") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("links"), list):
        raise LinkProviderPayloadError("provider response must contain a links list")
    return payload["links"]


def _has_global_evidence(event: LectureEvent, segment_count: int) -> bool:
    return bool(event.source_segment_ids) and all(
        isinstance(index, int) and 0 <= index < segment_count
        for index in event.source_segment_ids
    )


def _supporting_context(question, answers, source_segments):
    evidence_ids = set(question.source_segment_ids)
    for answer in answers:
        evidence_ids.update(answer.source_segment_ids)
    if not evidence_ids:
        return []
    radius = max(0, config.QA_LINK_CONTEXT_RADIUS_SEGMENTS)
    start = max(0, min(evidence_ids) - radius)
    end = min(len(source_segments) - 1, max(evidence_ids) + radius)
    return list(source_segments[start : end + 1])


async def process_question_answer_links(
    session: Session,
    video_id: str,
    provider: QuestionAnswerLinkProvider,
) -> QuestionAnswerProcessingResult:
    started = time.perf_counter()
    lesson_uuid = uuid.UUID(str(video_id))
    events = list_lecture_events(session, video_id)
    source_segments = load_source_transcript_segments(session, video_id)
    candidate_sets = generate_question_answer_candidates(
        events,
        max_window_seconds=config.QA_LINK_MAX_WINDOW_SECONDS,
    )

    candidate_pairs = 0
    processed_questions = 0
    failed_questions = 0
    rejected_count = 0
    provider_questions = 0
    provider_successes = 0
    proposed: dict[tuple[uuid.UUID, uuid.UUID, str], float] = {}

    for candidate_set in candidate_sets:
        question = candidate_set.question
        if not _has_global_evidence(question, len(source_segments)):
            rejected_count += 1
            processed_questions += 1
            continue
        answers = [
            answer
            for answer in candidate_set.answers
            if _has_global_evidence(answer, len(source_segments))
        ]
        rejected_count += len(candidate_set.answers) - len(answers)
        candidate_pairs += len(answers)
        if not answers:
            processed_questions += 1
            continue

        provider_questions += 1
        correction: str | None = None
        raw_items: list[Any] | None = None
        for attempt in range(1, config.QA_LINK_MAX_ATTEMPTS + 1):
            try:
                payload = await provider.select_links(
                    question,
                    answers,
                    _supporting_context(question, answers, source_segments),
                    corrective_instruction=correction,
                )
                raw_items = _decode_link_items(payload)
                break
            except Exception as exc:
                logger.warning(
                    "Q-A link attempt failed video_id=%s question_id=%s attempt=%d error_code=%s",
                    video_id,
                    question.id,
                    attempt,
                    type(exc).__name__,
                )
                correction = "Return one valid JSON object with a links array using only supplied IDs."

        if raw_items is None:
            failed_questions += 1
            continue

        provider_successes += 1
        processed_questions += 1
        allowed_answer_ids = {answer.id for answer in answers}
        answers_by_id = {answer.id: answer for answer in answers}
        for raw_item in raw_items:
            try:
                link = ProviderLink.model_validate(raw_item)
                if link.question_event_id != question.id:
                    raise RelationValidationError("Provider returned an unknown question ID.")
                if link.answer_event_id not in allowed_answer_ids:
                    raise RelationValidationError("Provider returned an unknown answer ID.")
                if link.confidence < config.QA_LINK_MIN_CONFIDENCE:
                    raise RelationValidationError("Link confidence is below threshold.")
                answer = answers_by_id[link.answer_event_id]
                validate_relation_events(question, answer, video_id=lesson_uuid)
                key = (
                    question.id,
                    answer.id,
                    RelationType.QUESTION_ANSWER.value,
                )
                proposed[key] = max(link.confidence, proposed.get(key, 0.0))
            except (ValidationError, RelationValidationError, TypeError, ValueError):
                rejected_count += 1

    existing = list_event_relations(session, video_id)
    preserved = [
        relation
        for relation in existing
        if not (
            relation.created_by == "AI"
            and relation.review_status == "UNREVIEWED"
        )
    ]
    preserved_keys = {
        (relation.source_event_id, relation.target_event_id, relation.relation_type)
        for relation in preserved
    }
    rejected_keys = {
        (relation.source_event_id, relation.target_event_id, relation.relation_type)
        for relation in existing
        if relation.review_status == "REJECTED"
    }

    created_count = 0
    all_provider_calls_failed = provider_questions > 0 and provider_successes == 0
    if not all_provider_calls_failed:
        session.exec(
            delete(LectureEventRelation).where(
                LectureEventRelation.video_id == lesson_uuid,
                LectureEventRelation.created_by == "AI",
                LectureEventRelation.review_status == "UNREVIEWED",
            )
        )
        for key, confidence in proposed.items():
            if key in preserved_keys or key in rejected_keys:
                rejected_count += 1
                continue
            session.add(
                LectureEventRelation(
                    video_id=lesson_uuid,
                    source_event_id=key[0],
                    target_event_id=key[1],
                    relation_type=key[2],
                    confidence=confidence,
                )
            )
            created_count += 1
        session.commit()

    latency_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "Q-A links processed video_id=%s questions=%d candidates=%d processed=%d failed=%d created=%d preserved=%d rejected=%d latency_ms=%.2f",
        video_id,
        len(candidate_sets),
        candidate_pairs,
        processed_questions,
        failed_questions,
        created_count,
        len(existing) if all_provider_calls_failed else len(preserved),
        rejected_count,
        latency_ms,
    )
    return QuestionAnswerProcessingResult(
        video_id=str(lesson_uuid),
        questions_considered=len(candidate_sets),
        candidate_pairs=candidate_pairs,
        processed_questions=processed_questions,
        failed_questions=failed_questions,
        relations_created=created_count,
        relations_preserved=(
            len(existing) if all_provider_calls_failed else len(preserved)
        ),
        relations_rejected=rejected_count,
        processing_latency_ms=round(latency_ms, 2),
    )
