import pytest

from src.backend.services.semantic_events.chunking import (
    chunk_transcript,
    normalize_transcript_segments,
)


def _raw_segments(count: int, *, text: str = "noi dung") -> list[dict]:
    return [
        {
            "index": index,
            "start": float(index * 10),
            "end": float((index + 1) * 10),
            "text": f"{text} {index}",
        }
        for index in range(count)
    ]


def test_empty_transcript_creates_no_chunks():
    assert chunk_transcript([], max_estimated_tokens=100, overlap_segments=2) == []


def test_one_segment_transcript_stays_whole():
    segments = normalize_transcript_segments(_raw_segments(1))

    chunks = chunk_transcript(
        segments,
        max_estimated_tokens=1,
        overlap_segments=2,
    )

    assert len(chunks) == 1
    assert chunks[0].start_segment_index == 0
    assert chunks[0].end_segment_index == 0


def test_short_transcript_uses_one_chunk():
    segments = normalize_transcript_segments(_raw_segments(3))

    chunks = chunk_transcript(
        segments,
        max_estimated_tokens=1_000,
        overlap_segments=2,
    )

    assert [[segment.segment_index for segment in chunk.segments] for chunk in chunks] == [
        [0, 1, 2]
    ]


def test_long_transcript_creates_multiple_chunks_without_splitting_segments():
    segments = normalize_transcript_segments(_raw_segments(12, text="x" * 32))

    chunks = chunk_transcript(
        segments,
        max_estimated_tokens=35,
        overlap_segments=1,
    )

    assert len(chunks) > 1
    assert all(chunk.segments for chunk in chunks)
    assert all(
        [segment.segment_index for segment in chunk.segments]
        == list(range(chunk.start_segment_index, chunk.end_segment_index + 1))
        for chunk in chunks
    )


def test_chunk_overlap_is_bounded_and_preserves_full_coverage():
    segments = normalize_transcript_segments(_raw_segments(8, text="x" * 16))

    chunks = chunk_transcript(
        segments,
        max_estimated_tokens=40,
        overlap_segments=1,
    )

    covered = {segment.segment_index for chunk in chunks for segment in chunk.segments}
    assert covered == set(range(8))
    for left, right in zip(chunks, chunks[1:]):
        overlap = set(item.segment_index for item in left.segments) & set(
            item.segment_index for item in right.segments
        )
        assert len(overlap) <= 1
        assert right.start_segment_index > left.start_segment_index


def test_normalization_rejects_reordered_canonical_indices():
    raw = _raw_segments(3)
    raw[1]["index"] = 2

    with pytest.raises(ValueError, match="reordered or non-canonical"):
        normalize_transcript_segments(raw)
