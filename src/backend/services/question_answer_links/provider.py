import json
from typing import Any, Protocol

from openai import AsyncOpenAI

from src.backend import config
from src.backend.models import LectureEvent
from src.backend.services.semantic_events.schemas import TranscriptSegment


class QuestionAnswerLinkProvider(Protocol):
    async def select_links(
        self,
        question: LectureEvent,
        candidate_answers: list[LectureEvent],
        supporting_segments: list[TranscriptSegment],
        *,
        corrective_instruction: str | None = None,
    ) -> Any: ...


def build_linking_prompt(
    question: LectureEvent,
    candidate_answers: list[LectureEvent],
    supporting_segments: list[TranscriptSegment],
    corrective_instruction: str | None = None,
) -> str:
    correction = (
        f"\nPrevious output was invalid. Correction required: {corrective_instruction}"
        if corrective_instruction
        else ""
    )
    payload = {
        "question": {
            "id": str(question.id),
            "title": question.title,
            "description": question.description,
            "source_segment_ids": question.source_segment_ids,
        },
        "candidate_answers": [
            {
                "id": str(answer.id),
                "title": answer.title,
                "description": answer.description,
                "source_segment_ids": answer.source_segment_ids,
            }
            for answer in candidate_answers
        ],
        "supporting_segments": [
            {"segment_index": segment.segment_index, "text": segment.text}
            for segment in supporting_segments
        ],
    }
    return f"""
Choose only well-supported QUESTION_ANSWER links from the supplied candidate IDs.
Do not invent IDs or use outside knowledge. It is valid to abstain with
{{"links": []}}. Return exactly one JSON object with key "links". Each link must
contain question_event_id, answer_event_id, and heuristic confidence in [0, 1].
One question may have multiple answers when the local evidence clearly supports it.
Prefer precision over recall.{correction}

Local evidence JSON:
{json.dumps(payload, ensure_ascii=False)}
""".strip()


class OpenAIQuestionAnswerLinkProvider:
    """Q-to-A adapter over an OpenAI-compatible provider endpoint."""

    def __init__(self, *, client: AsyncOpenAI | None = None, api_key: str | None = None):
        self._client = client
        self._api_key = (api_key if api_key is not None else config.GEMINI_API_KEY).strip()

    async def select_links(
        self,
        question: LectureEvent,
        candidate_answers: list[LectureEvent],
        supporting_segments: list[TranscriptSegment],
        *,
        corrective_instruction: str | None = None,
    ) -> str:
        if not self._api_key and self._client is None:
            raise RuntimeError("Question-answer link provider is not configured.")
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
                        "You link grounded lecture questions to candidate answers. "
                        "Return strict JSON and abstain when evidence is insufficient."
                    ),
                },
                {
                    "role": "user",
                    "content": build_linking_prompt(
                        question,
                        candidate_answers,
                        supporting_segments,
                        corrective_instruction,
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or '{"links":[]}'


def get_question_answer_link_provider() -> QuestionAnswerLinkProvider:
    return OpenAIQuestionAnswerLinkProvider()
