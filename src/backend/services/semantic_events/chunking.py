import math
from collections.abc import Sequence
from typing import Any

from .schemas import TranscriptChunk, TranscriptSegment


def normalize_transcript_segments(
    raw_segments: Sequence[dict[str, Any]],
) -> list[TranscriptSegment]:
    normalized: list[TranscriptSegment] = []
    for position, raw in enumerate(raw_segments):
        supplied_index = raw.get("index")
        if supplied_index is not None and int(supplied_index) != position:
            raise ValueError("transcript segment indices are reordered or non-canonical")
        normalized.append(
            TranscriptSegment(
                segment_index=position,
                start=float(raw.get("start", 0) or 0),
                end=float(raw.get("end", 0) or 0),
                text=str(raw.get("text", "")).strip(),
            )
        )
    return normalized


def estimate_segment_tokens(segment: TranscriptSegment) -> int:
    # A conservative language-agnostic approximation; chunk boundaries remain
    # segment based, so no caption text is split or reordered.
    return max(1, math.ceil(len(segment.text) / 4)) + 8


def chunk_transcript(
    segments: Sequence[TranscriptSegment],
    *,
    max_estimated_tokens: int,
    overlap_segments: int,
) -> list[TranscriptChunk]:
    if max_estimated_tokens < 1:
        raise ValueError("max_estimated_tokens must be positive")
    if overlap_segments < 0:
        raise ValueError("overlap_segments must not be negative")
    if not segments:
        return []

    expected_indices = list(range(len(segments)))
    if [segment.segment_index for segment in segments] != expected_indices:
        raise ValueError("segments must use canonical contiguous indices")

    chunks: list[TranscriptChunk] = []
    cursor = 0
    while cursor < len(segments):
        end_exclusive = cursor
        token_count = 0
        while end_exclusive < len(segments):
            next_cost = estimate_segment_tokens(segments[end_exclusive])
            if end_exclusive > cursor and token_count + next_cost > max_estimated_tokens:
                break
            token_count += next_cost
            end_exclusive += 1

        chunk_segments = list(segments[cursor:end_exclusive])
        chunks.append(
            TranscriptChunk(
                chunk_id=f"chunk-{len(chunks):04d}",
                start_segment_index=chunk_segments[0].segment_index,
                end_segment_index=chunk_segments[-1].segment_index,
                start_time=chunk_segments[0].start,
                end_time=chunk_segments[-1].end,
                segments=chunk_segments,
            )
        )

        if end_exclusive >= len(segments):
            break
        reusable_overlap = min(overlap_segments, max(0, len(chunk_segments) - 1))
        next_cursor = end_exclusive - reusable_overlap
        cursor = max(cursor + 1, next_cursor)

    return chunks
