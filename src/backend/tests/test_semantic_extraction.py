import asyncio
import json

from src.backend.services.semantic_events.chunking import (
    chunk_transcript,
    normalize_transcript_segments,
)
from src.backend.services.semantic_events.extractor import extract_chunk_events
from src.backend.services.semantic_events.schemas import InferenceType


class SequenceProvider:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def extract_events(
        self,
        chunk,
        output_language,
        *,
        corrective_instruction=None,
    ):
        self.calls.append((chunk.chunk_id, output_language, corrective_instruction))
        response = self.responses[len(self.calls) - 1]
        if isinstance(response, Exception):
            raise response
        return response


def _source_and_chunk():
    source = normalize_transcript_segments(
        [
            {"index": index, "start": index * 10, "end": (index + 1) * 10, "text": f"segment {index}"}
            for index in range(4)
        ]
    )
    return source, chunk_transcript(
        source,
        max_estimated_tokens=1_000,
        overlap_segments=0,
    )[0]


def _extract(provider):
    source, chunk = _source_and_chunk()
    return asyncio.run(
        extract_chunk_events(
            provider,
            chunk,
            source,
            output_language="vi",
            max_attempts=2,
            explicit_confidence_threshold=0.55,
            inferred_confidence_threshold=0.70,
        )
    )


def test_valid_json_is_grounded_to_source_timestamps():
    provider = SequenceProvider(
        [
            json.dumps(
                {
                    "events": [
                        {
                            "event_type": "QUESTION",
                            "start_segment_index": 1,
                            "end_segment_index": 2,
                            "title": "Câu hỏi về gradient",
                            "description": "",
                            "confidence": 0.9,
                        }
                    ]
                }
            )
        ]
    )

    result = _extract(provider)

    assert result.failed is False
    assert result.attempts == 1
    assert result.rejected_event_count == 0
    assert result.events[0].start_time == 10
    assert result.events[0].end_time == 30
    assert result.events[0].source_segment_ids == [1, 2]
    assert result.events[0].inference_type == InferenceType.EXPLICIT


def test_malformed_json_gets_one_bounded_correction_retry():
    provider = SequenceProvider(["not-json", {"events": []}])

    result = _extract(provider)

    assert result.failed is False
    assert result.attempts == 2
    assert len(provider.calls) == 2
    assert provider.calls[0][2] is None
    assert provider.calls[1][2] is not None


def test_malformed_json_twice_marks_only_the_chunk_failed():
    provider = SequenceProvider(["not-json", "still-not-json"])

    result = _extract(provider)

    assert result.failed is True
    assert result.attempts == 2
    assert result.error_code == "ProviderPayloadError"
    assert len(provider.calls) == 2


def test_provider_failure_is_bounded_to_two_attempts():
    provider = SequenceProvider([RuntimeError("offline"), RuntimeError("offline")])

    result = _extract(provider)

    assert result.failed is True
    assert result.error_code == "RuntimeError"
    assert len(provider.calls) == 2


def test_invalid_type_and_out_of_range_evidence_are_rejected_without_clamping():
    provider = SequenceProvider(
        [
            {
                "events": [
                    {
                        "event_type": "MADE_UP",
                        "start_segment_index": 0,
                        "end_segment_index": 0,
                        "title": "Invalid type",
                        "description": "",
                        "confidence": 0.99,
                    },
                    {
                        "event_type": "ANSWER",
                        "start_segment_index": 2,
                        "end_segment_index": 99,
                        "title": "Invalid evidence",
                        "description": "",
                        "confidence": 0.99,
                    },
                ]
            }
        ]
    )

    result = _extract(provider)

    assert result.failed is False
    assert result.raw_event_count == 2
    assert result.rejected_event_count == 2
    assert result.events == []


def test_empty_event_list_is_a_successful_extraction():
    result = _extract(SequenceProvider([{"events": []}]))

    assert result.failed is False
    assert result.raw_event_count == 0
    assert result.events == []


def test_inferred_events_use_the_stricter_confidence_threshold():
    provider = SequenceProvider(
        [
            {
                "events": [
                    {
                        "event_type": "TOPIC_CHANGE",
                        "start_segment_index": 1,
                        "end_segment_index": 1,
                        "title": "Chuyển chủ đề",
                        "description": "",
                        "confidence": 0.69,
                    }
                ]
            }
        ]
    )

    result = _extract(provider)

    assert result.rejected_event_count == 1
    assert result.events == []


def test_confidence_outside_zero_to_one_is_rejected():
    provider = SequenceProvider(
        [
            {
                "events": [
                    {
                        "event_type": "EXAMPLE",
                        "start_segment_index": 0,
                        "end_segment_index": 0,
                        "title": "Invalid confidence",
                        "description": "",
                        "confidence": 1.2,
                    }
                ]
            }
        ]
    )

    result = _extract(provider)

    assert result.rejected_event_count == 1
    assert result.events == []
