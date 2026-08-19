import re
import unicodedata
from difflib import SequenceMatcher

from .schemas import GroundedEvent


def _normalize_title(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[^\w]+", " ", normalized).strip()


def _title_similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, _normalize_title(left), _normalize_title(right)).ratio()


def _should_merge(
    left: GroundedEvent,
    right: GroundedEvent,
    *,
    title_similarity_threshold: float,
) -> bool:
    if left.event_type != right.event_type:
        return False
    if not set(left.source_segment_ids).intersection(right.source_segment_ids):
        return False
    if min(left.end_time, right.end_time) < max(left.start_time, right.start_time):
        return False
    return _title_similarity(left.title, right.title) >= title_similarity_threshold


def _merge_pair(left: GroundedEvent, right: GroundedEvent) -> GroundedEvent:
    preferred = right if right.confidence > left.confidence else left
    return preferred.model_copy(
        update={
            "start_time": min(left.start_time, right.start_time),
            "end_time": max(left.end_time, right.end_time),
            "confidence": max(left.confidence, right.confidence),
            "source_segment_ids": sorted(
                set(left.source_segment_ids).union(right.source_segment_ids)
            ),
        }
    )


def merge_duplicate_events(
    events: list[GroundedEvent],
    *,
    title_similarity_threshold: float,
) -> list[GroundedEvent]:
    if not 0 <= title_similarity_threshold <= 1:
        raise ValueError("title_similarity_threshold must be between 0 and 1")

    merged: list[GroundedEvent] = []
    for candidate in sorted(
        events,
        key=lambda item: (item.start_time, item.end_time, item.event_type.value, item.title),
    ):
        for index, existing in enumerate(merged):
            if _should_merge(
                existing,
                candidate,
                title_similarity_threshold=title_similarity_threshold,
            ):
                merged[index] = _merge_pair(existing, candidate)
                break
        else:
            merged.append(candidate)

    return sorted(merged, key=lambda item: (item.start_time, item.end_time, item.title))
