import json
from typing import Any, Protocol

from openai import AsyncOpenAI

from src.backend import config

from .schemas import TranscriptChunk


class ProviderNotConfiguredError(RuntimeError):
    pass


class SemanticEventProvider(Protocol):
    async def extract_events(
        self,
        chunk: TranscriptChunk,
        output_language: str,
        *,
        corrective_instruction: str | None = None,
    ) -> Any: ...


def _language_instruction(output_language: str) -> str:
    if output_language == "en":
        return "Write event titles and descriptions in English."
    if output_language == "vi":
        return "Write event titles and descriptions in Vietnamese."
    raise ValueError("output_language must be 'vi' or 'en'")


def build_extraction_prompt(
    chunk: TranscriptChunk,
    output_language: str,
    corrective_instruction: str | None = None,
) -> str:
    segment_payload = [
        {
            "segment_index": segment.segment_index,
            "text": segment.text,
        }
        for segment in chunk.segments
    ]
    correction = (
        f"\nPrevious output was invalid. Correction required: {corrective_instruction}"
        if corrective_instruction
        else ""
    )
    return f"""
Analyze only the supplied lecture transcript segments. Do not use outside knowledge,
invent quotations, or create timestamps. Prefer precision over recall. It is valid to
return {{"events": []}} and you do not need to find every event type.

Return exactly one JSON object with key "events". Each event must contain:
event_type, start_segment_index, end_segment_index, title, description, confidence.
Allowed event_type values: QUESTION, ANSWER, EXAMPLE, TOPIC_CHANGE, IMPORTANT,
ACTION, DEADLINE, EXAM_CUE. confidence must be between 0 and 1.

QUESTION requires a clear asking act. ANSWER requires an actual answer or explanation.
EXAMPLE requires illustrative content, not a keyword. TOPIC_CHANGE requires a clear
semantic transition. IMPORTANT requires explicit emphasis or a clearly central role.
Use only segment indices present below. {_language_instruction(output_language)}{correction}

Segments JSON:
{json.dumps(segment_payload, ensure_ascii=False)}
""".strip()


class OpenAISemanticEventProvider:
    """Semantic-event adapter over an OpenAI-compatible provider endpoint."""

    def __init__(self, *, client: AsyncOpenAI | None = None, api_key: str | None = None):
        self._client = client
        self._api_key = (api_key if api_key is not None else config.GEMINI_API_KEY).strip()

    async def extract_events(
        self,
        chunk: TranscriptChunk,
        output_language: str,
        *,
        corrective_instruction: str | None = None,
    ) -> str:
        if not self._api_key and self._client is None:
            raise ProviderNotConfiguredError("Semantic event provider is not configured.")
        client = self._client or AsyncOpenAI(
            api_key=self._api_key,
            base_url=config.AI_BASE_URL,
        )
        response = await client.chat.completions.create(
            model=config.AI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract grounded lecture events. Return strict JSON and "
                        "never invent evidence or timestamps."
                    ),
                },
                {
                    "role": "user",
                    "content": build_extraction_prompt(
                        chunk,
                        output_language,
                        corrective_instruction,
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or '{"events":[]}'


def get_semantic_event_provider() -> SemanticEventProvider:
    return OpenAISemanticEventProvider()
