import asyncio
import json
import uuid
from pathlib import Path

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend.models import (
    Category,
    ContentMetadata,
    Course,
    LectureEvent,
    LectureEventRelation,
    Lesson,
    Module,
)
from src.backend.services.lecture_grounding.service import (
    build_context_evidence,
    recover_lecture_context,
)
from src.backend.services.lecture_grounding.provider import build_context_prompt


class ContextProvider:
    def __init__(self, mode: str = "valid") -> None:
        self.mode = mode
        self.calls = 0

    async def recover_context(
        self,
        evidence_units,
        output_language,
        *,
        corrective_instruction=None,
    ):
        self.calls += 1
        event_unit = next(unit for unit in evidence_units if unit.kind == "event")
        item = {
            "type": "IMPORTANT",
            "text": "Điểm chính được phục hồi từ đúng bằng chứng bài giảng.",
            "source_event_ids": list(event_unit.source_event_ids),
            "source_segment_ids": list(event_unit.source_segment_ids),
        }
        if self.mode == "unknown_id":
            item["source_event_ids"] = [str(uuid.uuid4())]
            item["source_segment_ids"] = []
        if self.mode == "invented_timestamp":
            item["timestamp"] = 999
        if self.mode == "unsupported_type":
            item["type"] = "UNSUPPORTED_CONTEXT_KIND"
        if self.mode == "question_without_relation":
            item["type"] = "QUESTION"
        if self.mode == "qa_without_relation":
            item["type"] = "QUESTION_ANSWER"
        if self.mode == "lowercase_example":
            item["type"] = "example"
        if self.mode == "exact_real_types":
            returned_types = [
                "concept",
                "explanation",
                "example",
                "explanation",
                "observation",
            ]
            return {
                "summary": "Ngữ cảnh có căn cứ.",
                "items": [
                    {**item, "type": item_type, "text": f"Context item {index}"}
                    for index, item_type in enumerate(returned_types)
                ],
            }
        return {"summary": "Ngữ cảnh có căn cứ.", "items": [item]}

    async def answer_question(self, *args, **kwargs):
        raise AssertionError("Ask is outside this test.")


def _context_session(*, with_event: bool = True, event_type: str = "IMPORTANT"):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    category = Category(name=f"Context diagnostics {uuid.uuid4()}")
    session.add(category)
    session.flush()
    course = Course(category_id=category.id, title="Context diagnostics")
    session.add(course)
    session.flush()
    module = Module(course_id=course.id, title="Context module")
    session.add(module)
    session.flush()
    lesson = Lesson(id=uuid.uuid4(), module_id=module.id, title="Vietnamese context")
    session.add(lesson)
    segments = [
        {"index": 0, "start": 0.0, "end": 9.0, "text": "Mở đầu bài giảng."},
        {
            "index": 1,
            "start": 10.0,
            "end": 19.0,
            "text": "Regularization giúp giảm overfitting.",
        },
    ]
    session.add(
        ContentMetadata(
            lesson_id=lesson.id,
            ai_analysis={
                "transcript": {
                    "source_language": "vi",
                    "segments": segments,
                    "segments_by_language": {"vi": segments},
                }
            },
        )
    )
    if with_event:
        session.add(
            LectureEvent(
                video_id=lesson.id,
                event_type=event_type,
                start_time=10.0,
                end_time=19.0,
                title="Regularization",
                description="Giảm overfitting.",
                confidence=0.95,
                inference_type="EXPLICIT",
                source_segment_ids=[1],
            )
        )
    session.commit()
    return session, str(lesson.id)


def _recover(session, video_id, provider, diagnostics, *, current_time=30.0):
    return asyncio.run(
        recover_lecture_context(
            session,
            video_id,
            provider,
            current_time=current_time,
            window_seconds=30,
            output_language="vi",
            diagnostics=diagnostics,
        )
    )


def test_vietnamese_context_contract_accepts_grounded_allowed_type():
    session, video_id = _context_session()
    provider = ContextProvider()
    diagnostics = {}
    try:
        result = _recover(session, video_id, provider, diagnostics)
    finally:
        session.close()

    assert result.supported is True
    assert result.items[0].type == "IMPORTANT"
    assert result.items[0].timestamp == 10.0
    assert diagnostics["accepted_item_count"] == 1
    assert diagnostics["failure_class"] is None


def test_context_unknown_evidence_id_remains_rejected_with_reason_code():
    session, video_id = _context_session()
    diagnostics = {}
    try:
        result = _recover(session, video_id, ContextProvider("unknown_id"), diagnostics)
    finally:
        session.close()

    assert result.supported is False
    assert diagnostics["failure_class"] == "EMPTY_AFTER_VALIDATION"
    assert diagnostics["rejection_reason_codes"] == {"UNKNOWN_SOURCE_ID": 1}


def test_context_empty_evidence_abstains_without_provider_call():
    session, video_id = _context_session(with_event=False)
    provider = ContextProvider()
    diagnostics = {}
    try:
        result = _recover(
            session,
            video_id,
            provider,
            diagnostics,
            current_time=300.0,
        )
    finally:
        session.close()

    assert result.supported is False
    assert provider.calls == 0
    assert diagnostics["failure_class"] == "NO_CORE_EVIDENCE"


def test_context_provider_invented_timestamp_is_rejected_by_strict_schema():
    session, video_id = _context_session()
    provider = ContextProvider("invented_timestamp")
    diagnostics = {}
    try:
        result = _recover(session, video_id, provider, diagnostics)
    finally:
        session.close()

    assert result.supported is False
    assert provider.calls == 2
    assert diagnostics["failure_class"] == "MALFORMED_PROVIDER_RESPONSE"
    assert diagnostics["provider_response_parse_status"] == "FAIL"


def test_context_diagnostics_capture_type_contract_metadata_only():
    session, video_id = _context_session()
    diagnostics = {}
    try:
        result = _recover(session, video_id, ContextProvider("unsupported_type"), diagnostics)
    finally:
        session.close()

    assert result.supported is False
    assert diagnostics["returned_type_values"] == ["UNSUPPORTED_CONTEXT_KIND"]
    assert diagnostics["normalized_type_values"] == ["UNSUPPORTED_CONTEXT_KIND"]
    assert "IMPORTANT" in diagnostics["allowed_type_values"]
    assert diagnostics["type_rejection_reasons"] == [
        {
            "returned_type": "UNSUPPORTED_CONTEXT_KIND",
            "normalized_type": "UNSUPPORTED_CONTEXT_KIND",
            "rejection_reason": "UNSUPPORTED_ITEM_TYPE",
        }
    ]
    serialized = json.dumps(diagnostics, ensure_ascii=False)
    assert "Điểm chính" not in serialized
    assert "Regularization giúp" not in serialized


def test_exact_vi_provider_types_only_normalize_observed_canonical_alias():
    session, video_id = _context_session(event_type="EXAMPLE")
    diagnostics = {}
    try:
        result = _recover(session, video_id, ContextProvider("exact_real_types"), diagnostics)
    finally:
        session.close()

    assert diagnostics["returned_type_values"] == [
        "concept",
        "explanation",
        "example",
        "explanation",
        "observation",
    ]
    assert diagnostics["normalized_type_values"] == [
        "concept",
        "explanation",
        "EXAMPLE",
        "explanation",
        "observation",
    ]
    assert result.supported is True
    assert [item.type for item in result.items] == ["EXAMPLE"]
    assert diagnostics["rejection_reason_codes"] == {"UNSUPPORTED_ITEM_TYPE": 4}


def test_explicit_lowercase_example_alias_maps_to_canonical_type_and_backend_time():
    session, video_id = _context_session(event_type="EXAMPLE")
    diagnostics = {}
    try:
        result = _recover(session, video_id, ContextProvider("lowercase_example"), diagnostics)
    finally:
        session.close()

    assert result.supported is True
    assert result.items[0].type == "EXAMPLE"
    assert result.items[0].timestamp == 10.0
    assert diagnostics["normalized_type_values"] == ["EXAMPLE"]


def test_question_remains_separate_without_validated_relation():
    session, video_id = _context_session(event_type="QUESTION")
    try:
        result = _recover(session, video_id, ContextProvider("question_without_relation"), {})
    finally:
        session.close()

    assert result.supported is True
    assert result.items[0].type == "QUESTION"
    assert "chưa có câu trả lời liên kết" in result.items[0].text


def test_question_answer_type_requires_valid_relation_evidence():
    session, video_id = _context_session(event_type="QUESTION")
    diagnostics = {}
    try:
        result = _recover(session, video_id, ContextProvider("qa_without_relation"), diagnostics)
    finally:
        session.close()

    assert result.supported is False
    assert diagnostics["rejection_reason_codes"] == {"MISSING_RELATION_EVIDENCE": 1}


def test_context_prompt_declares_exact_canonical_taxonomy_and_relation_rule():
    prompt = build_context_prompt([], "vi")

    assert "TOPIC_CHANGE, QUESTION_ANSWER, QUESTION, ANSWER, EXAMPLE" in prompt
    assert "IMPORTANT, ACTION, DEADLINE, EXAM_CUE, TRANSCRIPT" in prompt
    assert "Do not translate them or change their uppercase spelling" in prompt
    assert "QUESTION_ANSWER only when citing both source event IDs" in prompt
    assert "concept" not in prompt
    assert "observation" not in prompt


def test_exact_vi_smoke_window_uses_canonical_same_video_evidence():
    transcript_path = (
        Path(__file__).resolve().parents[3]
        / "evaluation"
        / "data"
        / "transcripts"
        / "synthetic-vi-regularization.json"
    )
    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        category = Category(name="Exact VI smoke context")
        session.add(category)
        session.flush()
        course = Course(category_id=category.id, title="Exact VI smoke")
        session.add(course)
        session.flush()
        module = Module(course_id=course.id, title="Exact VI module")
        session.add(module)
        session.flush()
        lesson = Lesson(id=uuid.uuid4(), module_id=module.id, title="VI regularization")
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
        question = LectureEvent(
            video_id=lesson.id,
            event_type="QUESTION",
            start_time=300,
            end_time=360,
            title="Dropout khi suy luận?",
            confidence=0.95,
            inference_type="EXPLICIT",
            source_segment_ids=[5],
        )
        answer = LectureEvent(
            video_id=lesson.id,
            event_type="ANSWER",
            start_time=360,
            end_time=420,
            title="Dropout được tắt khi suy luận",
            confidence=0.95,
            inference_type="EXPLICIT",
            source_segment_ids=[6],
        )
        rejected = LectureEvent(
            video_id=lesson.id,
            event_type="IMPORTANT",
            start_time=420,
            end_time=480,
            title="Rejected evidence",
            confidence=0.95,
            inference_type="EXPLICIT",
            source_segment_ids=[7],
            review_status="REJECTED",
        )
        session.add_all([question, answer, rejected])
        session.flush()
        relation = LectureEventRelation(
            video_id=lesson.id,
            source_event_id=question.id,
            target_event_id=answer.id,
            relation_type="QUESTION_ANSWER",
            confidence=0.95,
        )
        session.add(relation)
        session.commit()

        units, events_by_id, segments_by_id, core_segment_count = build_context_evidence(
            session,
            str(lesson.id),
            current_time=480,
            window_seconds=300,
            boundary_seconds=45,
        )

        assert core_segment_count == 7
        assert sum(unit.kind == "event" for unit in units) == 2
        assert sum(unit.kind == "relation" for unit in units) == 1
        assert str(rejected.id) not in events_by_id
        assert all(
            event_id in events_by_id
            for unit in units
            for event_id in unit.source_event_ids
        )
        assert all(
            segment_id in segments_by_id
            for unit in units
            for segment_id in unit.source_segment_ids
        )
        assert all(str(event.video_id) == str(lesson.id) for event in events_by_id.values())
