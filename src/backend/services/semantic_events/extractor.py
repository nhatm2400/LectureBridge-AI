import json
import logging
from collections.abc import Sequence
from typing import Any

from pydantic import ValidationError

from .provider import SemanticEventProvider
from .schemas import ChunkExtractionResult, ProviderEvent, TranscriptChunk, TranscriptSegment
from .validation import EventValidationError, validate_and_ground_event

logger = logging.getLogger(__name__)


class ProviderPayloadError(ValueError):
    pass


def _decode_event_items(payload: Any) -> list[Any]:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ProviderPayloadError("provider response is not valid JSON") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("events"), list):
        raise ProviderPayloadError("provider response must contain an events list")
    return payload["events"]


async def extract_chunk_events(
    provider: SemanticEventProvider,
    chunk: TranscriptChunk,
    source_segments: Sequence[TranscriptSegment],
    *,
    output_language: str,
    max_attempts: int,
    explicit_confidence_threshold: float,
    inferred_confidence_threshold: float,
) -> ChunkExtractionResult:
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least one")

    correction: str | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            payload = await provider.extract_events(
                chunk,
                output_language,
                corrective_instruction=correction,
            )
            raw_items = _decode_event_items(payload)
        except Exception as exc:
            error_code = type(exc).__name__
            logger.warning(
                "Semantic extraction attempt failed chunk_id=%s attempt=%d error_code=%s",
                chunk.chunk_id,
                attempt,
                error_code,
            )
            if attempt == max_attempts:
                return ChunkExtractionResult(
                    chunk_id=chunk.chunk_id,
                    failed=True,
                    attempts=attempt,
                    error_code=error_code,
                )
            correction = "Return one valid JSON object with an events array."
            continue

        grounded = []
        rejected = 0
        for raw_item in raw_items:
            try:
                provider_event = ProviderEvent.model_validate(raw_item)
                grounded.append(
                    validate_and_ground_event(
                        provider_event,
                        chunk=chunk,
                        source_segments=source_segments,
                        explicit_confidence_threshold=explicit_confidence_threshold,
                        inferred_confidence_threshold=inferred_confidence_threshold,
                    )
                )
            except (ValidationError, EventValidationError, TypeError, ValueError):
                rejected += 1

        return ChunkExtractionResult(
            chunk_id=chunk.chunk_id,
            events=grounded,
            raw_event_count=len(raw_items),
            rejected_event_count=rejected,
            attempts=attempt,
        )

    raise AssertionError("bounded extraction loop exited unexpectedly")
