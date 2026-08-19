from src.backend.services.semantic_events.merge import merge_duplicate_events
from src.backend.services.semantic_events.schemas import (
    EventType,
    GroundedEvent,
    InferenceType,
)


def _event(
    *,
    event_type: EventType = EventType.QUESTION,
    title: str,
    source_ids: list[int],
    start: float,
    end: float,
    confidence: float,
) -> GroundedEvent:
    return GroundedEvent(
        event_type=event_type,
        start_time=start,
        end_time=end,
        title=title,
        description=f"description {confidence}",
        confidence=confidence,
        inference_type=InferenceType.EXPLICIT,
        source_segment_ids=source_ids,
    )


def test_overlap_boundary_duplicate_is_merged_deterministically():
    events = [
        _event(
            title="Vì sao cần activation?",
            source_ids=[4, 5],
            start=40,
            end=60,
            confidence=0.82,
        ),
        _event(
            title="Vì sao cần activation",
            source_ids=[5, 6],
            start=50,
            end=70,
            confidence=0.91,
        ),
    ]

    merged = merge_duplicate_events(events, title_similarity_threshold=0.60)

    assert len(merged) == 1
    assert merged[0].source_segment_ids == [4, 5, 6]
    assert merged[0].start_time == 40
    assert merged[0].end_time == 70
    assert merged[0].confidence == 0.91
    assert merged[0].title == "Vì sao cần activation"


def test_adjacent_distinct_questions_are_not_merged():
    events = [
        _event(title="Câu hỏi một", source_ids=[1], start=10, end=20, confidence=0.9),
        _event(title="Câu hỏi hai", source_ids=[2], start=20, end=30, confidence=0.9),
    ]

    merged = merge_duplicate_events(events, title_similarity_threshold=0.60)

    assert len(merged) == 2


def test_same_title_with_different_evidence_is_preserved():
    events = [
        _event(title="Kiểm tra hiểu bài", source_ids=[3], start=30, end=40, confidence=0.8),
        _event(title="Kiểm tra hiểu bài", source_ids=[8], start=80, end=90, confidence=0.9),
    ]

    merged = merge_duplicate_events(events, title_similarity_threshold=0.60)

    assert len(merged) == 2
    assert [event.source_segment_ids for event in merged] == [[3], [8]]


def test_different_event_types_never_merge():
    events = [
        _event(title="Khái niệm chính", source_ids=[5], start=50, end=60, confidence=0.8),
        _event(
            event_type=EventType.ANSWER,
            title="Khái niệm chính",
            source_ids=[5],
            start=50,
            end=60,
            confidence=0.9,
        ),
    ]

    assert len(merge_duplicate_events(events, title_similarity_threshold=0.60)) == 2
