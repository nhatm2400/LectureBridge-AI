import json
import logging
import re
import time
import unicodedata
import uuid
from collections import Counter
from typing import Any

from openai import OpenAIError
from pydantic import ValidationError
from sqlmodel import Session

from src.backend import config
from src.backend.models import LectureEvent, LectureEventRelation
from src.backend.services.question_answer_links.service import list_event_relations
from src.backend.services.semantic_events.service import (
    list_lecture_events,
    load_source_transcript_segments,
)

from .provider import LectureGroundingProvider
from .schemas import (
    AskLectureResponse,
    CONTEXT_ITEM_TYPE_VALUES,
    ContextRecoveryItem,
    ContextRecoveryResponse,
    EvidenceUnit,
    LectureCitation,
    ProviderAskResponse,
    ProviderContextResponse,
)

logger = logging.getLogger(__name__)

_EVENT_PRIORITY = {
    "TOPIC_CHANGE": 100,
    "QUESTION": 95,
    "ANSWER": 90,
    "QUESTION_ANSWER": 88,
    "IMPORTANT": 80,
    "EXAMPLE": 70,
    "ACTION": 65,
    "DEADLINE": 64,
    "EXAM_CUE": 63,
    "TRANSCRIPT": 10,
}
_ALLOWED_CONTEXT_TYPES = frozenset(CONTEXT_ITEM_TYPE_VALUES)
_CONTEXT_TYPE_ALIASES = {
    # Exact serialization alias observed in the VI Gemini smoke. Generic labels
    # such as concept/explanation/observation intentionally remain unsupported.
    "example": "EXAMPLE",
}
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "what",
    "when", "where", "which", "who", "why", "with", "đã", "đang", "được", "gì",
    "là", "một", "như", "nào", "ra", "sao", "thế", "trong", "tại", "và", "về",
}
_VIETNAMESE_MARKERS = frozenset(
    {"ai", "bao", "cach", "cho", "duoc", "khong", "nhu", "phai", "sao", "tai", "the", "vi", "ve"}
)
_ENGLISH_MARKERS = frozenset(
    {"answer", "citation", "evidence", "seek", "source", "timestamp", "what", "when", "where", "which", "why"}
)


def _decode_payload(payload: Any) -> Any:
    if isinstance(payload, str):
        return json.loads(payload)
    return payload


def _normalize_context_type(value: str) -> str:
    return _CONTEXT_TYPE_ALIASES.get(value, value)


def _event_text(event: LectureEvent, segments_by_id: dict[int, Any]) -> str:
    source_text = " ".join(
        segments_by_id[index].text
        for index in event.source_segment_ids
        if index in segments_by_id
    )
    return " ".join(
        part for part in (event.title, event.description, source_text) if str(part).strip()
    ).strip()


def _usable_events(session: Session, video_id: str) -> list[LectureEvent]:
    return [
        event
        for event in list_lecture_events(session, video_id)
        if event.review_status != "REJECTED" and event.source_segment_ids
    ]


def _usable_relations(session: Session, video_id: str) -> list[LectureEventRelation]:
    return [
        relation
        for relation in list_event_relations(session, video_id)
        if relation.review_status != "REJECTED"
    ]


def build_context_evidence(
    session: Session,
    video_id: str,
    *,
    current_time: float,
    window_seconds: int,
    boundary_seconds: float | None = None,
) -> tuple[list[EvidenceUnit], dict[str, LectureEvent], dict[int, Any], int]:
    segments = load_source_transcript_segments(session, video_id)
    segments_by_id = {segment.segment_index: segment for segment in segments}
    window_start = max(0.0, current_time - window_seconds)
    boundary = (
        config.CONTEXT_RECOVERY_BOUNDARY_SECONDS
        if boundary_seconds is None
        else max(0.0, boundary_seconds)
    )
    expanded_start = max(0.0, window_start - boundary)
    expanded_end = current_time + boundary
    core_segments = [
        segment
        for segment in segments
        if segment.end >= window_start and segment.start <= current_time
    ]
    nearby_segments = [
        segment
        for segment in segments
        if segment.end >= expanded_start and segment.start <= expanded_end
    ]

    selected_events = [
        event
        for event in _usable_events(session, video_id)
        if event.end_time >= window_start and event.start_time <= current_time
    ]
    events_by_id = {str(event.id): event for event in selected_events}
    units: list[EvidenceUnit] = []
    for event in selected_events:
        units.append(
            EvidenceUnit(
                evidence_id=f"event:{event.id}",
                kind="event",
                text=_event_text(event, segments_by_id),
                start_time=event.start_time,
                end_time=event.end_time,
                source_event_ids=[str(event.id)],
                source_segment_ids=list(event.source_segment_ids),
                event_type=event.event_type,
                priority=_EVENT_PRIORITY.get(event.event_type, 20),
            )
        )

    for relation in _usable_relations(session, video_id):
        source = events_by_id.get(str(relation.source_event_id))
        target = events_by_id.get(str(relation.target_event_id))
        if source is None and target is None:
            continue
        # A relation is useful only when both grounded endpoints are available.
        all_events = {str(event.id): event for event in _usable_events(session, video_id)}
        source = all_events.get(str(relation.source_event_id))
        target = all_events.get(str(relation.target_event_id))
        if source is None or target is None:
            continue
        source_ids = sorted(set(source.source_segment_ids + target.source_segment_ids))
        units.append(
            EvidenceUnit(
                evidence_id=f"relation:{relation.id}",
                kind="relation",
                text=f"Question: {_event_text(source, segments_by_id)} Answer: {_event_text(target, segments_by_id)}",
                start_time=min(source.start_time, target.start_time),
                end_time=max(source.end_time, target.end_time),
                source_event_ids=[str(source.id), str(target.id)],
                source_segment_ids=source_ids,
                event_type="QUESTION_ANSWER",
                priority=_EVENT_PRIORITY["QUESTION_ANSWER"],
            )
        )
        events_by_id[str(source.id)] = source
        events_by_id[str(target.id)] = target

    for segment in nearby_segments:
        if not segment.text:
            continue
        units.append(
            EvidenceUnit(
                evidence_id=f"segment:{segment.segment_index}",
                kind="segment",
                text=segment.text,
                start_time=segment.start,
                end_time=segment.end,
                source_segment_ids=[segment.segment_index],
                event_type="TRANSCRIPT",
                priority=_EVENT_PRIORITY["TRANSCRIPT"],
            )
        )
    units.sort(key=lambda unit: (-unit.priority, unit.start_time, unit.evidence_id))
    return units, events_by_id, segments_by_id, len(core_segments)


def _unsupported_context(video_id: str, language: str, *, latency_ms: float = 0) -> ContextRecoveryResponse:
    summary = (
        "Không đủ dữ liệu để phục hồi chính xác đoạn này."
        if language == "vi"
        else "There is not enough evidence to recover this section accurately."
    )
    return ContextRecoveryResponse(
        video_id=video_id,
        summary=summary,
        items=[],
        supported=False,
        metrics={"evidence_count": 0, "validated_item_count": 0, "latency_ms": round(latency_ms, 2)},
    )


async def recover_lecture_context(
    session: Session,
    video_id: str,
    provider: LectureGroundingProvider,
    *,
    current_time: float,
    window_seconds: int,
    output_language: str,
    diagnostics: dict[str, Any] | None = None,
) -> ContextRecoveryResponse:
    started = time.perf_counter()
    units, events_by_id, segments_by_id, core_segment_count = build_context_evidence(
        session,
        video_id,
        current_time=current_time,
        window_seconds=window_seconds,
    )
    if diagnostics is not None:
        window_start = max(0.0, current_time - window_seconds)
        boundary = max(0.0, config.CONTEXT_RECOVERY_BOUNDARY_SECONDS)
        diagnostics.update(
            {
                "window_start": window_start,
                "window_end": current_time,
                "boundary_seconds": boundary,
                "event_count_in_window": sum(unit.kind == "event" for unit in units),
                "relation_count_in_window": sum(unit.kind == "relation" for unit in units),
                "segment_count_in_window": core_segment_count,
                "evidence_unit_count": len(units),
                "provider_response_parse_status": "NOT_RUN",
                "provider_attempt_count": 0,
                "provider_error_codes": [],
                "returned_item_count": 0,
                "returned_type_values": [],
                "normalized_type_values": [],
                "allowed_type_values": sorted(_ALLOWED_CONTEXT_TYPES),
                "type_rejection_reasons": [],
                "accepted_item_count": 0,
                "rejected_item_count": 0,
                "rejection_reason_codes": {},
                "context_supported": False,
                "failure_class": None,
            }
        )
    if core_segment_count == 0 and not any(unit.kind == "event" for unit in units):
        if diagnostics is not None:
            diagnostics["failure_class"] = "NO_CORE_EVIDENCE"
        return _unsupported_context(video_id, output_language)

    parsed: ProviderContextResponse | None = None
    correction: str | None = None
    for attempt in range(config.LECTURE_GROUNDING_MAX_ATTEMPTS):
        if diagnostics is not None:
            diagnostics["provider_attempt_count"] = attempt + 1
        try:
            payload = await provider.recover_context(
                units,
                output_language,
                corrective_instruction=correction,
            )
            parsed = ProviderContextResponse.model_validate(_decode_payload(payload))
            if diagnostics is not None:
                diagnostics["provider_response_parse_status"] = "PASS"
            break
        except (
            ValidationError,
            TypeError,
            ValueError,
            json.JSONDecodeError,
            RuntimeError,
            OpenAIError,
        ) as exc:
            if diagnostics is not None:
                diagnostics["provider_response_parse_status"] = "FAIL"
                diagnostics["provider_error_codes"].append(type(exc).__name__)
            logger.warning(
                "Context recovery provider failure video_id=%s attempt=%d error_code=%s",
                video_id,
                attempt + 1,
                type(exc).__name__,
            )
            correction = "Return one valid JSON object and cite only supplied source IDs."

    if parsed is None:
        if diagnostics is not None:
            parse_errors = {"ValidationError", "JSONDecodeError", "TypeError", "ValueError"}
            diagnostics["failure_class"] = (
                "MALFORMED_PROVIDER_RESPONSE"
                if any(code in parse_errors for code in diagnostics["provider_error_codes"])
                else "PROVIDER_ERROR"
            )
        return _unsupported_context(
            video_id,
            output_language,
            latency_ms=(time.perf_counter() - started) * 1000,
        )

    allowed_event_ids = {
        event_id
        for unit in units
        for event_id in unit.source_event_ids
    }
    allowed_segment_ids = {
        segment_id
        for unit in units
        for segment_id in unit.source_segment_ids
    }
    validated: list[ContextRecoveryItem] = []
    seen: set[tuple] = set()
    rejected: Counter[str] = Counter()
    if diagnostics is not None:
        diagnostics["returned_item_count"] = len(parsed.items)
        diagnostics["returned_type_values"] = [item.type for item in parsed.items]
        diagnostics["normalized_type_values"] = [
            _normalize_context_type(item.type) for item in parsed.items
        ]
    for raw_item in parsed.items:
        normalized_type = _normalize_context_type(raw_item.type)
        if normalized_type not in _ALLOWED_CONTEXT_TYPES:
            rejected["UNSUPPORTED_ITEM_TYPE"] += 1
            if diagnostics is not None:
                diagnostics["type_rejection_reasons"].append(
                    {
                        "returned_type": raw_item.type,
                        "normalized_type": normalized_type,
                        "rejection_reason": "UNSUPPORTED_ITEM_TYPE",
                    }
                )
            continue
        event_ids = list(dict.fromkeys(raw_item.source_event_ids))
        segment_ids = list(dict.fromkeys(raw_item.source_segment_ids))
        if not event_ids and not segment_ids:
            rejected["NO_SOURCE_ID"] += 1
            continue
        if any(event_id not in allowed_event_ids for event_id in event_ids):
            rejected["UNKNOWN_SOURCE_ID"] += 1
            continue
        if any(segment_id not in allowed_segment_ids for segment_id in segment_ids):
            rejected["UNKNOWN_SOURCE_ID"] += 1
            continue
        if any(event_id not in events_by_id for event_id in event_ids):
            rejected["UNMAPPABLE_SOURCE_ID"] += 1
            continue
        if any(segment_id not in segments_by_id for segment_id in segment_ids):
            rejected["UNMAPPABLE_SOURCE_ID"] += 1
            continue
        if normalized_type == "QUESTION_ANSWER":
            cited_event_ids = set(event_ids)
            has_relation_evidence = any(
                unit.kind == "relation"
                and set(unit.source_event_ids).issubset(cited_event_ids)
                for unit in units
            )
            if not has_relation_evidence:
                rejected["MISSING_RELATION_EVIDENCE"] += 1
                continue
        timestamps = [
            events_by_id[event_id].start_time
            for event_id in event_ids
            if event_id in events_by_id
        ] + [
            segments_by_id[segment_id].start
            for segment_id in segment_ids
            if segment_id in segments_by_id
        ]
        if not timestamps:
            rejected["UNMAPPABLE_SOURCE_ID"] += 1
            continue
        item_text = raw_item.text
        if normalized_type == "QUESTION" and event_ids:
            has_linked_answer = any(
                unit.kind == "relation"
                and any(event_id in unit.source_event_ids for event_id in event_ids)
                for unit in units
            )
            if not has_linked_answer:
                notice = (
                    "Có một câu hỏi được phát hiện, nhưng chưa có câu trả lời liên kết đủ tin cậy."
                    if output_language == "vi"
                    else "A question was detected, but it has no sufficiently reliable linked answer."
                )
                item_text = f"{raw_item.text} {notice}".strip()
        key = (normalized_type, item_text, tuple(event_ids), tuple(segment_ids))
        if key in seen:
            rejected["DUPLICATE_ITEM"] += 1
            continue
        seen.add(key)
        validated.append(
            ContextRecoveryItem(
                type=normalized_type,
                text=item_text,
                source_event_ids=event_ids,
                source_segment_ids=segment_ids,
                timestamp=min(timestamps),
            )
        )

    latency_ms = (time.perf_counter() - started) * 1000
    if diagnostics is not None:
        diagnostics["accepted_item_count"] = len(validated)
        diagnostics["rejected_item_count"] = sum(rejected.values())
        diagnostics["rejection_reason_codes"] = dict(sorted(rejected.items()))
    if not validated:
        if diagnostics is not None:
            diagnostics["failure_class"] = (
                "NO_PROVIDER_ITEMS" if not parsed.items else "EMPTY_AFTER_VALIDATION"
            )
        return _unsupported_context(video_id, output_language, latency_ms=latency_ms)
    validated.sort(key=lambda item: item.timestamp)
    response = ContextRecoveryResponse(
        video_id=video_id,
        summary=(
            parsed.summary.strip()
            or (
                "Các điểm chính dưới đây được phục hồi từ bằng chứng của bài giảng."
                if output_language == "vi"
                else "The points below were recovered from lecture evidence."
            )
        ),
        items=validated,
        supported=True,
        metrics={
            "evidence_count": len(units),
            "validated_item_count": len(validated),
            "latency_ms": round(latency_ms, 2),
        },
    )
    if diagnostics is not None:
        diagnostics["context_supported"] = True
        diagnostics["failure_class"] = None
    return response


def _tokens(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return [
        token
        for token in re.findall(r"[\w]+", normalized, flags=re.UNICODE)
        if len(token) > 1 and token not in _STOPWORDS
    ]


def _question_language(value: str) -> str:
    tokens = set(_tokens(value))
    has_vietnamese = bool(tokens & _VIETNAMESE_MARKERS) or any(
        character in value.casefold()
        for character in "ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ"
    )
    has_english = bool(tokens & _ENGLISH_MARKERS)
    if has_vietnamese and has_english:
        return "vi-en"
    if has_vietnamese:
        return "vi"
    if has_english:
        return "en"
    return "unknown"


def _lexical_score(question_tokens: list[str], unit: EvidenceUnit) -> float:
    if not question_tokens:
        return 0.0
    q_counts = Counter(question_tokens)
    unit_counts = Counter(_tokens(unit.text))
    overlap = sum(min(count, unit_counts[token]) for token, count in q_counts.items())
    if overlap == 0:
        return 0.0
    coverage = overlap / max(1, len(q_counts))
    kind_bonus = 0.35 if unit.kind in {"event", "relation"} else 0.0
    return overlap + coverage + kind_bonus + (unit.priority / 1000)


def build_ask_evidence(
    session: Session,
    video_id: str,
    question: str,
    *,
    limit: int | None = None,
    diagnostics: dict[str, Any] | None = None,
) -> list[EvidenceUnit]:
    segments = load_source_transcript_segments(session, video_id)
    segments_by_id = {segment.segment_index: segment for segment in segments}
    units: list[EvidenceUnit] = []
    events = _usable_events(session, video_id)
    events_by_id = {str(event.id): event for event in events}
    for event in events:
        units.append(
            EvidenceUnit(
                evidence_id=f"event:{event.id}",
                kind="event",
                text=_event_text(event, segments_by_id),
                start_time=event.start_time,
                end_time=event.end_time,
                source_event_ids=[str(event.id)],
                source_segment_ids=list(event.source_segment_ids),
                event_type=event.event_type,
                priority=_EVENT_PRIORITY.get(event.event_type, 20),
            )
        )
    for relation in _usable_relations(session, video_id):
        source = events_by_id.get(str(relation.source_event_id))
        target = events_by_id.get(str(relation.target_event_id))
        if source is None or target is None:
            continue
        units.append(
            EvidenceUnit(
                evidence_id=f"relation:{relation.id}",
                kind="relation",
                text=f"Question: {_event_text(source, segments_by_id)} Answer: {_event_text(target, segments_by_id)}",
                start_time=source.start_time,
                end_time=target.end_time,
                source_event_ids=[str(source.id), str(target.id)],
                source_segment_ids=sorted(set(source.source_segment_ids + target.source_segment_ids)),
                event_type="QUESTION_ANSWER",
                priority=_EVENT_PRIORITY["QUESTION_ANSWER"],
            )
        )
    for segment in segments:
        if segment.text:
            units.append(
                EvidenceUnit(
                    evidence_id=f"segment:{segment.segment_index}",
                    kind="segment",
                    text=segment.text,
                    start_time=segment.start,
                    end_time=segment.end,
                    source_segment_ids=[segment.segment_index],
                    event_type="TRANSCRIPT",
                    priority=_EVENT_PRIORITY["TRANSCRIPT"],
                )
            )
    question_tokens = _tokens(question)
    ranked = [
        (score, unit)
        for unit in units
        if (score := _lexical_score(question_tokens, unit)) > 0
    ]
    ranked.sort(key=lambda pair: (-pair[0], pair[1].start_time, pair[1].evidence_id))
    selected = ranked[: (limit or config.ASK_LECTURE_EVIDENCE_COUNT)]
    if diagnostics is not None:
        diagnostics.update(
            {
                "question_language": _question_language(question),
                "retrieval_candidate_count": len(units),
                "retrieved_evidence_count": len(selected),
                "retrieved_evidence_ids": [unit.evidence_id for _, unit in selected],
                "retrieval_scores": [
                    {
                        "evidence_id": unit.evidence_id,
                        "score": round(score, 6),
                    }
                    for score, unit in selected
                ],
            }
        )
    return [unit for _, unit in selected]


def _unsupported_ask(video_id: str, language: str, evidence_count: int = 0) -> AskLectureResponse:
    answer = (
        "Bài giảng hiện tại không có đủ bằng chứng để trả lời câu hỏi này."
        if language == "vi"
        else "The current lecture does not contain enough evidence to answer this question."
    )
    return AskLectureResponse(
        video_id=video_id,
        answer=answer,
        supported=False,
        citations=[],
        evidence_count=evidence_count,
    )


async def ask_lecture(
    session: Session,
    video_id: str,
    provider: LectureGroundingProvider,
    *,
    question: str,
    output_language: str,
    diagnostics: dict[str, Any] | None = None,
) -> AskLectureResponse:
    if diagnostics is not None:
        diagnostics.update(
            {
                "question_language": _question_language(question),
                "retrieval_candidate_count": 0,
                "retrieved_evidence_count": 0,
                "retrieved_evidence_ids": [],
                "retrieval_scores": [],
                "provider_parse_status": "NOT_RUN",
                "provider_attempt_count": 0,
                "provider_error_codes": [],
                "provider_supported_flag": None,
                "provider_used_evidence_ids": [],
                "accepted_evidence_ids": [],
                "rejected_evidence_ids": [],
                "rejection_reason_codes": {},
                "failure_classes": [],
                "final_supported": False,
                "citation_count": 0,
            }
        )
    evidence = build_ask_evidence(
        session,
        video_id,
        question,
        diagnostics=diagnostics,
    )
    if not evidence:
        if diagnostics is not None:
            diagnostics["failure_classes"] = ["NO_RETRIEVAL_HIT"]
        return _unsupported_ask(video_id, output_language)
    parsed: ProviderAskResponse | None = None
    correction: str | None = None
    for attempt in range(config.LECTURE_GROUNDING_MAX_ATTEMPTS):
        if diagnostics is not None:
            diagnostics["provider_attempt_count"] = attempt + 1
        try:
            payload = await provider.answer_question(
                question,
                evidence,
                output_language,
                corrective_instruction=correction,
            )
            parsed = ProviderAskResponse.model_validate(_decode_payload(payload))
            if diagnostics is not None:
                diagnostics["provider_parse_status"] = "PASS"
            break
        except (
            ValidationError,
            TypeError,
            ValueError,
            json.JSONDecodeError,
            RuntimeError,
            OpenAIError,
        ) as exc:
            if diagnostics is not None:
                diagnostics["provider_parse_status"] = "FAIL"
                diagnostics["provider_error_codes"].append(type(exc).__name__)
            logger.warning(
                "Ask lecture provider failure video_id=%s attempt=%d error_code=%s",
                video_id,
                attempt + 1,
                type(exc).__name__,
            )
            correction = "Return valid JSON and use only supplied evidence IDs."
    if parsed is None:
        if diagnostics is not None:
            diagnostics["failure_classes"] = ["ANSWER_VALIDATION_REJECT"]
        return _unsupported_ask(video_id, output_language, len(evidence))
    if diagnostics is not None:
        diagnostics["provider_supported_flag"] = parsed.supported
        diagnostics["provider_used_evidence_ids"] = list(parsed.used_evidence_ids)
    if not parsed.supported:
        if diagnostics is not None:
            diagnostics["failure_classes"] = ["PROVIDER_ABSTAINS"]
        return _unsupported_ask(video_id, output_language, len(evidence))
    if not parsed.answer.strip():
        if diagnostics is not None:
            diagnostics["failure_classes"] = ["ANSWER_VALIDATION_REJECT"]
        return _unsupported_ask(video_id, output_language, len(evidence))
    if not parsed.used_evidence_ids:
        if diagnostics is not None:
            diagnostics["failure_classes"] = [
                "PROVIDER_RETURNS_NO_EVIDENCE",
                "SUPPORTED_WITHOUT_EVIDENCE",
            ]
            diagnostics["rejection_reason_codes"] = {"PROVIDER_RETURNS_NO_EVIDENCE": 1}
        return _unsupported_ask(video_id, output_language, len(evidence))
    by_id = {unit.evidence_id: unit for unit in evidence}
    used_ids = list(dict.fromkeys(parsed.used_evidence_ids))
    accepted_ids = [evidence_id for evidence_id in used_ids if evidence_id in by_id]
    rejected_ids = [evidence_id for evidence_id in used_ids if evidence_id not in by_id]
    if diagnostics is not None:
        diagnostics["accepted_evidence_ids"] = accepted_ids
        diagnostics["rejected_evidence_ids"] = rejected_ids
    if rejected_ids:
        if diagnostics is not None:
            diagnostics["failure_classes"] = ["PROVIDER_RETURNS_INVALID_EVIDENCE_ID"]
            diagnostics["rejection_reason_codes"] = {
                "PROVIDER_RETURNS_INVALID_EVIDENCE_ID": len(rejected_ids)
            }
        return _unsupported_ask(video_id, output_language, len(evidence))
    citations = [
        LectureCitation(
            evidence_id=evidence_id,
            timestamp=by_id[evidence_id].start_time,
            end_time=by_id[evidence_id].end_time,
            source_event_ids=by_id[evidence_id].source_event_ids,
            source_segment_ids=by_id[evidence_id].source_segment_ids,
        )
        for evidence_id in used_ids
    ]
    if diagnostics is not None:
        diagnostics["final_supported"] = True
        diagnostics["citation_count"] = len(citations)
    return AskLectureResponse(
        video_id=video_id,
        answer=parsed.answer.strip(),
        supported=True,
        citations=citations,
        evidence_count=len(evidence),
    )
