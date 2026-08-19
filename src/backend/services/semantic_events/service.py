import logging
import time
import uuid

from sqlalchemy import delete, or_
from sqlmodel import Session, select

from src.backend import config
from src.backend.models import (
    ContentMetadata,
    LectureEvent,
    LectureEventRelation,
    Lesson,
)

from .chunking import chunk_transcript, normalize_transcript_segments
from .extractor import extract_chunk_events
from .merge import merge_duplicate_events
from .provider import SemanticEventProvider
from .schemas import CreatedBy, LectureProcessingResult, ReviewStatus

logger = logging.getLogger(__name__)


class TranscriptNotFoundError(ValueError):
    pass


def _source_segment_payload(content: ContentMetadata) -> list[dict]:
    analysis = content.ai_analysis if isinstance(content.ai_analysis, dict) else {}
    transcript = analysis.get("transcript")
    if not isinstance(transcript, dict):
        raise TranscriptNotFoundError("Timestamped transcript is not available.")

    by_language = transcript.get("segments_by_language")
    source_language = str(transcript.get("source_language") or "").lower()
    if isinstance(by_language, dict) and isinstance(by_language.get(source_language), list):
        return by_language[source_language]
    segments = transcript.get("segments")
    if isinstance(segments, list):
        return segments
    raise TranscriptNotFoundError("Timestamped transcript segments are not available.")


def list_lecture_events(session: Session, video_id: str) -> list[LectureEvent]:
    lesson_uuid = uuid.UUID(str(video_id))
    statement = (
        select(LectureEvent)
        .where(LectureEvent.video_id == lesson_uuid)
        .order_by(LectureEvent.start_time, LectureEvent.end_time, LectureEvent.created_at)
    )
    return list(session.exec(statement).all())


def load_source_transcript_segments(
    session: Session,
    video_id: str,
):
    lesson_uuid = uuid.UUID(str(video_id))
    content = session.exec(
        select(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid)
    ).first()
    if content is None:
        raise TranscriptNotFoundError("Timestamped transcript is not available.")
    return normalize_transcript_segments(_source_segment_payload(content))


async def process_lecture_events(
    session: Session,
    video_id: str,
    provider: SemanticEventProvider,
    *,
    output_language: str = "vi",
) -> LectureProcessingResult:
    started = time.perf_counter()
    if output_language not in {"vi", "en"}:
        raise ValueError("output_language must be 'vi' or 'en'")

    lesson_uuid = uuid.UUID(str(video_id))
    if session.get(Lesson, lesson_uuid) is None:
        raise TranscriptNotFoundError("Lecture does not exist.")
    source_segments = load_source_transcript_segments(session, video_id)
    chunks = chunk_transcript(
        source_segments,
        max_estimated_tokens=config.SEMANTIC_CHUNK_MAX_TOKENS,
        overlap_segments=config.SEMANTIC_CHUNK_OVERLAP_SEGMENTS,
    )

    extracted_events = []
    processed_chunks = 0
    failed_chunks = 0
    raw_count = 0
    rejected_count = 0
    for chunk in chunks:
        chunk_result = await extract_chunk_events(
            provider,
            chunk,
            source_segments,
            output_language=output_language,
            max_attempts=config.SEMANTIC_EXTRACTION_MAX_ATTEMPTS,
            explicit_confidence_threshold=config.SEMANTIC_EXPLICIT_CONFIDENCE_THRESHOLD,
            inferred_confidence_threshold=config.SEMANTIC_INFERRED_CONFIDENCE_THRESHOLD,
        )
        raw_count += chunk_result.raw_event_count
        rejected_count += chunk_result.rejected_event_count
        if chunk_result.failed:
            failed_chunks += 1
            continue
        processed_chunks += 1
        extracted_events.extend(chunk_result.events)

    deduplicated = merge_duplicate_events(
        extracted_events,
        title_similarity_threshold=config.SEMANTIC_TITLE_SIMILARITY_THRESHOLD,
    )

    persisted_count = 0
    # Preserve the last usable snapshot if every provider call failed. Empty or
    # partially successful processing is otherwise an intentional replacement.
    if processed_chunks > 0 or not chunks:
        replaceable_events = list(
            session.exec(
                select(LectureEvent).where(
                    LectureEvent.video_id == lesson_uuid,
                    LectureEvent.created_by == CreatedBy.AI.value,
                    LectureEvent.review_status == ReviewStatus.UNREVIEWED.value,
                )
            ).all()
        )
        replaceable_ids = {event.id for event in replaceable_events}
        protected_event_ids: set[uuid.UUID] = set()
        if replaceable_ids:
            related = list(
                session.exec(
                    select(LectureEventRelation).where(
                        LectureEventRelation.video_id == lesson_uuid,
                        or_(
                            LectureEventRelation.source_event_id.in_(replaceable_ids),
                            LectureEventRelation.target_event_id.in_(replaceable_ids),
                        ),
                    )
                ).all()
            )
            replaceable_relation_ids = [
                relation.id
                for relation in related
                if relation.created_by == CreatedBy.AI.value
                and relation.review_status == ReviewStatus.UNREVIEWED.value
            ]
            if replaceable_relation_ids:
                session.exec(
                    delete(LectureEventRelation).where(
                        LectureEventRelation.id.in_(replaceable_relation_ids)
                    )
                )
            for relation in related:
                if relation.id in replaceable_relation_ids:
                    continue
                protected_event_ids.add(relation.source_event_id)
                protected_event_ids.add(relation.target_event_id)

        deletable_ids = replaceable_ids - protected_event_ids
        if deletable_ids:
            session.exec(
                delete(LectureEvent).where(LectureEvent.id.in_(deletable_ids))
            )
        for event in deduplicated:
            session.add(
                LectureEvent(
                    video_id=lesson_uuid,
                    event_type=event.event_type.value,
                    start_time=event.start_time,
                    end_time=event.end_time,
                    title=event.title,
                    description=event.description,
                    confidence=event.confidence,
                    inference_type=event.inference_type.value,
                    source_segment_ids=event.source_segment_ids,
                    created_by=event.created_by.value,
                    review_status=event.review_status.value,
                )
            )
        session.commit()
        persisted_count = len(deduplicated)

    latency_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "Lecture events processed video_id=%s segments=%d chunks=%d processed=%d failed=%d raw=%d rejected=%d deduplicated=%d persisted=%d latency_ms=%.2f",
        video_id,
        len(source_segments),
        len(chunks),
        processed_chunks,
        failed_chunks,
        raw_count,
        rejected_count,
        len(deduplicated),
        persisted_count,
        latency_ms,
    )
    return LectureProcessingResult(
        video_id=str(lesson_uuid),
        segment_count=len(source_segments),
        chunk_count=len(chunks),
        processed_chunks=processed_chunks,
        failed_chunks=failed_chunks,
        raw_extracted_events=raw_count,
        validation_rejected_events=rejected_count,
        deduplicated_events=len(deduplicated),
        persisted_events=persisted_count,
        events_created=persisted_count,
        processing_latency_ms=round(latency_ms, 2),
    )
