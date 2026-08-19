import asyncio
import json
import uuid
from pathlib import Path

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend.models import Category, ContentMetadata, Course, Lesson, Module
from src.backend.services.lecture_grounding.provider import build_ask_prompt
from src.backend.services.lecture_grounding.service import ask_lecture, build_ask_evidence


SUPPORTED_QUESTION = "Tại sao citation phải seek về source timestamp?"
UNSUPPORTED_QUESTION = "Which company has the best accessibility product?"


class AskProvider:
    def __init__(self, mode: str = "valid") -> None:
        self.mode = mode
        self.calls = 0
        self.received_evidence_ids: list[str] = []

    async def recover_context(self, *args, **kwargs):
        raise AssertionError("Context is outside this test.")

    async def answer_question(
        self,
        question,
        evidence_units,
        output_language,
        *,
        corrective_instruction=None,
    ):
        self.calls += 1
        self.received_evidence_ids = [unit.evidence_id for unit in evidence_units]
        if self.mode == "abstain":
            return {"answer": "", "used_evidence_ids": [], "supported": False}
        if self.mode == "invalid_id":
            return {
                "answer": "Câu trả lời không được chấp nhận.",
                "used_evidence_ids": ["segment:999"],
                "supported": True,
            }
        return {
            "answer": (
                "Citation quay lại bằng chứng nguồn; timestamp được backend ánh xạ "
                "từ source evidence chính tắc."
            ),
            "used_evidence_ids": ["segment:9"],
            "supported": True,
        }


def _codeswitch_session():
    transcript_path = (
        Path(__file__).resolve().parents[3]
        / "evaluation"
        / "data"
        / "transcripts"
        / "synthetic-codeswitch-accessibility.json"
    )
    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    category = Category(name=f"Code-switch Ask {uuid.uuid4()}")
    session.add(category)
    session.flush()
    course = Course(category_id=category.id, title="Code-switch Ask")
    session.add(course)
    session.flush()
    module = Module(course_id=course.id, title="Grounded Ask")
    session.add(module)
    session.flush()
    lesson = Lesson(id=uuid.uuid4(), module_id=module.id, title="Accessibility")
    session.add(lesson)
    session.add(
        ContentMetadata(
            lesson_id=lesson.id,
            ai_analysis={
                "transcript": {
                    "source_language": "vi",
                    "segments": transcript["segments"],
                    "segments_by_language": {"vi": transcript["segments"]},
                }
            },
        )
    )
    session.commit()
    return session, str(lesson.id)


def test_supported_codeswitch_query_retrieves_canonical_source_evidence():
    session, video_id = _codeswitch_session()
    diagnostics = {}
    try:
        evidence = build_ask_evidence(
            session,
            video_id,
            SUPPORTED_QUESTION,
            diagnostics=diagnostics,
        )
    finally:
        session.close()

    assert diagnostics["question_language"] == "vi-en"
    assert diagnostics["retrieval_candidate_count"] == 15
    assert diagnostics["retrieved_evidence_count"] > 0
    assert "segment:9" in diagnostics["retrieved_evidence_ids"]
    segment_nine = next(unit for unit in evidence if unit.evidence_id == "segment:9")
    assert segment_nine.source_segment_ids == [9]
    assert segment_nine.start_time == 540


def test_valid_used_evidence_id_produces_backend_mapped_citation():
    session, video_id = _codeswitch_session()
    provider = AskProvider()
    diagnostics = {}
    try:
        result = asyncio.run(
            ask_lecture(
                session,
                video_id,
                provider,
                question=SUPPORTED_QUESTION,
                output_language="vi",
                diagnostics=diagnostics,
            )
        )
    finally:
        session.close()

    assert "segment:9" in provider.received_evidence_ids
    assert diagnostics["provider_parse_status"] == "PASS"
    assert diagnostics["provider_supported_flag"] is True
    assert diagnostics["provider_used_evidence_ids"] == ["segment:9"]
    assert diagnostics["accepted_evidence_ids"] == ["segment:9"]
    assert diagnostics["rejected_evidence_ids"] == []
    assert result.supported is True
    assert result.citations[0].evidence_id == "segment:9"
    assert result.citations[0].timestamp == 540
    assert result.citations[0].source_segment_ids == [9]
    assert diagnostics["citation_count"] == 1


def test_invalid_provider_evidence_id_remains_rejected():
    session, video_id = _codeswitch_session()
    diagnostics = {}
    try:
        result = asyncio.run(
            ask_lecture(
                session,
                video_id,
                AskProvider("invalid_id"),
                question=SUPPORTED_QUESTION,
                output_language="vi",
                diagnostics=diagnostics,
            )
        )
    finally:
        session.close()

    assert result.supported is False
    assert result.citations == []
    assert diagnostics["rejected_evidence_ids"] == ["segment:999"]
    assert diagnostics["failure_classes"] == ["PROVIDER_RETURNS_INVALID_EVIDENCE_ID"]


def test_provider_abstention_is_preserved_for_unsupported_query():
    session, video_id = _codeswitch_session()
    diagnostics = {}
    try:
        result = asyncio.run(
            ask_lecture(
                session,
                video_id,
                AskProvider("abstain"),
                question=UNSUPPORTED_QUESTION,
                output_language="vi",
                diagnostics=diagnostics,
            )
        )
    finally:
        session.close()

    assert result.supported is False
    assert result.citations == []
    assert diagnostics["provider_supported_flag"] is False
    assert diagnostics["failure_classes"] == ["PROVIDER_ABSTAINS"]


def test_no_retrieval_hit_abstains_before_provider_and_adds_no_outside_answer():
    session, video_id = _codeswitch_session()
    provider = AskProvider()
    diagnostics = {}
    try:
        result = asyncio.run(
            ask_lecture(
                session,
                video_id,
                provider,
                question="Mongolia lunar geology",
                output_language="vi",
                diagnostics=diagnostics,
            )
        )
    finally:
        session.close()

    assert provider.calls == 0
    assert result.supported is False
    assert result.citations == []
    assert diagnostics["failure_classes"] == ["NO_RETRIEVAL_HIT"]


def test_ask_prompt_allows_grounded_citation_discussion_but_not_invention():
    prompt = build_ask_prompt(SUPPORTED_QUESTION, [], "vi")

    assert "do not abstain solely because of code-switching" in prompt
    assert "may explain citations or timestamps" in prompt
    assert "never invent a citation ID or timestamp" in prompt
    assert "backend maps those IDs to timestamps" in prompt
    assert "Never create timestamps or citations" not in prompt
