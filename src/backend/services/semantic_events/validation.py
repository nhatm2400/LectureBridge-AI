from collections.abc import Sequence

from .schemas import (
    EXPLICIT_EVENT_TYPES,
    GroundedEvent,
    InferenceType,
    ProviderEvent,
    TranscriptChunk,
    TranscriptSegment,
)


class EventValidationError(ValueError):
    pass


def validate_and_ground_event(
    event: ProviderEvent,
    *,
    chunk: TranscriptChunk,
    source_segments: Sequence[TranscriptSegment],
    explicit_confidence_threshold: float,
    inferred_confidence_threshold: float,
) -> GroundedEvent:
    start = event.start_segment_index
    end = event.end_segment_index
    if start < 0 or end < start or end >= len(source_segments):
        raise EventValidationError("source segment range is invalid")

    source_ids = list(range(start, end + 1))
    chunk_ids = {segment.segment_index for segment in chunk.segments}
    if not set(source_ids).issubset(chunk_ids):
        raise EventValidationError("source segment range is outside the supplied chunk")

    inference_type = (
        InferenceType.EXPLICIT
        if event.event_type in EXPLICIT_EVENT_TYPES
        else InferenceType.INFERRED
    )
    threshold = (
        explicit_confidence_threshold
        if inference_type == InferenceType.EXPLICIT
        else inferred_confidence_threshold
    )
    if event.confidence < threshold:
        raise EventValidationError("event confidence is below configured threshold")

    return GroundedEvent(
        event_type=event.event_type,
        start_time=source_segments[start].start,
        end_time=source_segments[end].end,
        title=event.title,
        description=event.description,
        confidence=event.confidence,
        inference_type=inference_type,
        source_segment_ids=source_ids,
    )
