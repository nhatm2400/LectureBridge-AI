import uuid

import pytest

from src.backend.models import LectureEvent
from src.backend.services.ai_service import AIService
from src.backend.services.artifact_service import build_ai_analysis
from src.backend.services.lecture_grounding.learning import (
    source_aware_highlights,
    validate_artifact_evidence,
)
from src.backend.services.pipeline_service import _transcript_fingerprint


def _lecture_event(event_type="IMPORTANT", review_status="UNREVIEWED"):
    return LectureEvent(
        id=uuid.uuid4(),
        video_id=uuid.uuid4(),
        event_type=event_type,
        start_time=65,
        end_time=70,
        title="Core concept",
        description="Direct source detail",
        confidence=0.9,
        inference_type="INFERRED",
        source_segment_ids=[6],
        review_status=review_status,
    )


def test_highlights_map_reviewed_semantic_evidence():
    event = _lecture_event()
    rejected = _lecture_event(review_status="REJECTED")
    unrelated = _lecture_event(event_type="ANSWER")
    highlights = source_aware_highlights([event, rejected, unrelated])
    assert len(highlights) == 1
    assert highlights[0]["timestamp"] == 65
    assert highlights[0]["source_event_ids"] == [str(event.id)]
    assert highlights[0]["source_segment_ids"] == [6]


@pytest.mark.parametrize(
    "item_type,item",
    [
        ("flashcard", {"front": "Q", "back": "A", "source_segment_ids": [2]}),
        (
            "quiz",
            {
                "question_text": "Q?",
                "options": {"A": "yes", "B": "no"},
                "correct_answer": "A",
                "explanation": "Evidence says yes",
                "source_segment_ids": [3],
            },
        ),
    ],
)
def test_new_learning_items_require_valid_evidence(item_type, item):
    validated = validate_artifact_evidence([item], segment_count=5, item_type=item_type)
    assert len(validated) == 1
    assert validated[0]["source_segment_ids"] == item["source_segment_ids"]
    assert validated[0]["source_event_ids"] == []
    without_evidence = {key: value for key, value in item.items() if key != "source_segment_ids"}
    assert validate_artifact_evidence([without_evidence], segment_count=5, item_type=item_type) == []
    invalid = dict(item, source_segment_ids=[99])
    assert validate_artifact_evidence([invalid], segment_count=5, item_type=item_type) == []


def test_pipeline_analysis_drops_ungrounded_new_cards_and_quiz():
    result = build_ai_analysis(
        transcript={"segments": [{"index": 0, "start": 0, "end": 1, "text": "source"}]},
        summary=[],
        flashcards=[{"front": "Q", "back": "A"}],
        quizzes=[
            {
                "question_text": "Q?",
                "options": {"A": "yes"},
                "correct_answer": "A",
            }
        ],
        require_source_evidence=True,
    )
    assert result["flashcards"] == []
    assert result["quizzes"] == []


def test_source_fingerprint_is_stable_and_changes_with_transcript():
    first = {
        "source_language": "vi",
        "segments_by_language": {"vi": [{"index": 0, "start": 0, "end": 1, "text": "A"}]},
    }
    equivalent = {
        "segments_by_language": {"vi": [{"text": "A", "end": 1, "start": 0, "index": 0}]},
        "source_language": "vi",
    }
    changed = {
        "source_language": "vi",
        "segments_by_language": {"vi": [{"index": 0, "start": 0, "end": 1, "text": "B"}]},
    }
    assert _transcript_fingerprint(first) == _transcript_fingerprint(equivalent)
    assert _transcript_fingerprint(first) != _transcript_fingerprint(changed)


def test_bilingual_transcript_uses_requested_output_language_as_default():
    source = {
        "video_id": "video-1",
        "language": "vi",
        "segments": [{"index": 0, "start": 0, "end": 1, "text": "Xin chao"}],
    }
    translated = {
        "video_id": "video-1",
        "language": "en",
        "segments": [{"index": 0, "start": 0, "end": 1, "text": "Hello"}],
    }

    result = AIService.build_bilingual_transcript(
        source,
        translated,
        preferred_language="en",
    )

    assert result["language"] == "en"
    assert result["segments"][0]["text"] == "Hello"


@pytest.mark.asyncio
async def test_full_summary_covers_last_chunk_without_prefix_truncation(monkeypatch):
    calls: list[str] = []
    client_kwargs: dict = {}

    class Message:
        content = "- chunk covered"

    class Choice:
        message = Message()

    class Response:
        choices = [Choice()]

    class Completions:
        async def create(self, **kwargs):
            calls.append(kwargs["messages"][-1]["content"])
            return Response()

    class Chat:
        completions = Completions()

    class FakeClient:
        chat = Chat()

    def fake_client(**kwargs):
        client_kwargs.update(kwargs)
        return FakeClient()

    monkeypatch.setattr("src.backend.services.ai_service.AsyncOpenAI", fake_client)
    monkeypatch.setattr("src.backend.services.ai_service.config.GEMINI_API_KEY", "test-key")
    transcript = {
        "segments": [
            {"index": index, "start": index, "end": index + 1, "text": f"marker-{index}"}
            for index in range(81)
        ]
    }
    result = await AIService.summarize_full_lecture(transcript)
    assert result == ["- chunk covered"]
    assert client_kwargs == {
        "api_key": "test-key",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
    }
    assert len(calls) == 4  # three chunks and one final synthesis
    assert any("marker-80" in call and '"segment_id": 80' in call for call in calls)


@pytest.mark.asyncio
async def test_full_summary_uses_requested_english_output_language(monkeypatch):
    system_prompts: list[str] = []

    class Message:
        content = "- English summary"

    class Choice:
        message = Message()

    class Response:
        choices = [Choice()]

    class Completions:
        async def create(self, **kwargs):
            system_prompts.append(kwargs["messages"][0]["content"])
            return Response()

    class Chat:
        completions = Completions()

    class FakeClient:
        chat = Chat()

    monkeypatch.setattr(
        "src.backend.services.ai_service.AsyncOpenAI",
        lambda **_kwargs: FakeClient(),
    )
    monkeypatch.setattr(
        "src.backend.services.ai_service.config.GEMINI_API_KEY",
        "test-key",
    )

    result = await AIService.summarize_full_lecture(
        {
            "segments": [
                {"index": 0, "start": 0, "end": 1, "text": "Source evidence"}
            ]
        },
        output_language="en",
    )

    assert result == ["- English summary"]
    assert system_prompts == [
        "Summarize only the supplied lecture evidence in English. Do not use outside knowledge."
    ]


@pytest.mark.asyncio
async def test_flashcards_and_quizzes_use_requested_english_output_language(monkeypatch):
    system_prompts: list[str] = []

    class Message:
        def __init__(self, content: str):
            self.content = content

    class Choice:
        def __init__(self, content: str):
            self.message = Message(content)

    class Response:
        def __init__(self, content: str):
            self.choices = [Choice(content)]

    class Completions:
        async def create(self, **kwargs):
            prompt = kwargs["messages"][0]["content"]
            system_prompts.append(prompt)
            if "flashcards" in prompt:
                return Response('{"flashcards": []}')
            return Response('{"quizzes": []}')

    class Chat:
        completions = Completions()

    class FakeClient:
        chat = Chat()

    monkeypatch.setattr(
        "src.backend.services.ai_service.AsyncOpenAI",
        lambda **_kwargs: FakeClient(),
    )
    monkeypatch.setattr(
        "src.backend.services.ai_service.config.GEMINI_API_KEY",
        "test-key",
    )
    transcript = {
        "segments": [
            {"index": 0, "start": 0, "end": 1, "text": "Source evidence"}
        ]
    }

    await AIService.generate_grounded_flashcards(
        transcript,
        output_language="en",
    )
    await AIService.generate_persistent_quizzes(
        transcript,
        output_language="en",
    )

    assert len(system_prompts) == 2
    assert all("English" in prompt for prompt in system_prompts)
