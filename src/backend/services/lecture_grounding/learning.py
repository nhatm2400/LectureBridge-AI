from typing import Any

from src.backend.models import LectureEvent


HIGHLIGHT_EVENT_TYPES = frozenset(
    {"IMPORTANT", "EXAM_CUE", "ACTION", "DEADLINE", "EXAMPLE"}
)


def source_aware_highlights(events: list[LectureEvent]) -> list[dict[str, Any]]:
    """Map reviewed semantic events to the compact highlight response."""
    items = []
    for event in events:
        if event.review_status == "REJECTED" or event.event_type not in HIGHLIGHT_EVENT_TYPES:
            continue
        items.append(
            {
                "time": _format_timestamp(event.start_time),
                "timestamp": event.start_time,
                "reason": event.title,
                "context": event.description,
                "source_event_ids": [str(event.id)],
                "source_segment_ids": list(event.source_segment_ids),
            }
        )
    return items


def _format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def validate_artifact_evidence(
    items: Any,
    *,
    segment_count: int,
    item_type: str,
) -> list[dict[str, Any]]:
    """Drop generated study items that cannot map to canonical source segments."""
    if not isinstance(items, list):
        return []
    validated: list[dict[str, Any]] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        try:
            source_segment_ids = list(dict.fromkeys(int(value) for value in raw.get("source_segment_ids", [])))
        except (TypeError, ValueError):
            continue
        source_event_ids = [str(value) for value in raw.get("source_event_ids", []) if str(value).strip()]
        # This generation path receives canonical transcript segments, but no
        # event registry. Event-only IDs therefore cannot be verified here.
        if not source_segment_ids:
            continue
        if any(index < 0 or index >= segment_count for index in source_segment_ids):
            continue
        if item_type == "flashcard":
            required = str(raw.get("front", "")).strip() and str(raw.get("back", "")).strip()
        else:
            options = raw.get("options")
            required = (
                str(raw.get("question_text", "")).strip()
                and isinstance(options, dict)
                and str(raw.get("correct_answer", "")).strip() in options
            )
        if not required:
            continue
        item = dict(raw)
        item["source_segment_ids"] = source_segment_ids
        item["source_event_ids"] = source_event_ids
        validated.append(item)
    return validated
