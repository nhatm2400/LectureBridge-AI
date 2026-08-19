import asyncio
import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from src.backend import config
from src.backend.auth import create_access_token, get_password_hash
from src.backend.database import get_session
from src.backend.main import app
from src.backend.models import (
    Category,
    ContentMetadata,
    Course,
    LectureEvent,
    Lesson,
    Module,
    Role,
    User,
)
from src.backend.services.semantic_events.provider import get_semantic_event_provider
from src.backend.services.semantic_events.service import process_lecture_events


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "synthetic_lecture_transcript.json"


def _event_payload(event_type: str, index: int, title: str) -> dict:
    return {
        "event_type": event_type,
        "start_segment_index": index,
        "end_segment_index": index,
        "title": title,
        "description": f"Grounded at source segment {index}",
        "confidence": 0.93,
    }


class FixtureProvider:
    target_events = {
        3: ("QUESTION", "Vì sao cần hàm kích hoạt?"),
        4: ("ANSWER", "Nhiều lớp tuyến tính vẫn là tuyến tính"),
        5: ("EXAMPLE", "Ví dụ phân loại ảnh"),
        8: ("IMPORTANT", "Learning rate cần được kiểm soát"),
        10: ("TOPIC_CHANGE", "Chuyển sang regularization"),
        13: ("QUESTION", "Vì sao dropout chỉ dùng khi training?"),
        14: ("ANSWER", "Dropout giảm phụ thuộc giữa các neuron"),
        15: ("EXAMPLE", "Ví dụ dấu hiệu overfitting"),
        20: ("TOPIC_CHANGE", "Chuyển sang đánh giá mô hình"),
        25: ("IMPORTANT", "Metric phải phản ánh chi phí thực tế"),
        27: ("ACTION", "So sánh các metric trên confusion matrix"),
        28: ("DEADLINE", "Hạn nộp tối thứ Sáu"),
    }

    def __init__(self, *, fail_calls: set[int] | None = None):
        self.calls = 0
        self.fail_calls = fail_calls or set()

    async def extract_events(
        self,
        chunk,
        output_language,
        *,
        corrective_instruction=None,
    ):
        self.calls += 1
        if self.calls in self.fail_calls:
            raise RuntimeError("synthetic provider outage")
        indices = {segment.segment_index for segment in chunk.segments}
        events = [
            _event_payload(event_type, index, title)
            for index, (event_type, title) in self.target_events.items()
            if index in indices
        ]
        return {"events": events}


class PerChunkProvider:
    def __init__(self, title: str):
        self.title = title

    async def extract_events(
        self,
        chunk,
        output_language,
        *,
        corrective_instruction=None,
    ):
        index = chunk.start_segment_index
        return {"events": [_event_payload("EXAMPLE", index, self.title)]}


@pytest.fixture
def semantic_env(monkeypatch: pytest.MonkeyPatch):
    transcript = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    monkeypatch.setattr(config, "SEMANTIC_CHUNK_MAX_TOKENS", 110)
    monkeypatch.setattr(config, "SEMANTIC_CHUNK_OVERLAP_SEGMENTS", 1)
    monkeypatch.setattr(config, "SEMANTIC_EXTRACTION_MAX_ATTEMPTS", 2)

    with Session(engine) as session:
        teacher_role = Role(name="teacher")
        student_role = Role(name="student")
        session.add(teacher_role)
        session.add(student_role)
        session.commit()

        owner = User(
            email="event-owner@example.test",
            password_hash=get_password_hash("Password123"),
            full_name="Event Owner",
            role_id=teacher_role.id,
        )
        outsider = User(
            email="event-outsider@example.test",
            password_hash=get_password_hash("Password123"),
            full_name="Event Outsider",
            role_id=student_role.id,
        )
        session.add(owner)
        session.add(outsider)
        session.commit()

        category = Category(name="Lecture intelligence")
        session.add(category)
        session.commit()
        course = Course(
            category_id=category.id,
            instructor_id=owner.id,
            title="Synthetic lecture course",
        )
        session.add(course)
        session.commit()
        module = Module(course_id=course.id, title="Semantic events")
        session.add(module)
        session.commit()
        lesson = Lesson(
            id=uuid.uuid4(),
            module_id=module.id,
            title="Ten minute synthetic lecture",
            status="completed",
            duration_minutes=10,
        )
        session.add(lesson)
        session.commit()
        session.add(
            ContentMetadata(
                lesson_id=lesson.id,
                ai_analysis={"transcript": transcript},
            )
        )
        session.commit()
        lesson_id = str(lesson.id)

    owner_client = TestClient(app)
    owner_client.cookies.set(
        "access_token", create_access_token({"sub": "event-owner@example.test"})
    )
    outsider_client = TestClient(app)
    outsider_client.cookies.set(
        "access_token", create_access_token({"sub": "event-outsider@example.test"})
    )

    yield {
        "engine": engine,
        "lesson_id": lesson_id,
        "owner": owner_client,
        "outsider": outsider_client,
        "anonymous": TestClient(app),
    }

    app.dependency_overrides.pop(get_semantic_event_provider, None)
    app.dependency_overrides.pop(get_session, None)


def test_processing_persists_events_and_preserves_reviewed_or_human_rows(semantic_env):
    lesson_uuid = uuid.UUID(semantic_env["lesson_id"])
    with Session(semantic_env["engine"]) as session:
        session.add(
            LectureEvent(
                video_id=lesson_uuid,
                event_type="EXAMPLE",
                start_time=1,
                end_time=2,
                title="stale unreviewed AI event",
                confidence=0.8,
                inference_type="EXPLICIT",
                source_segment_ids=[0],
            )
        )
        session.add(
            LectureEvent(
                video_id=lesson_uuid,
                event_type="IMPORTANT",
                start_time=2,
                end_time=3,
                title="confirmed AI event",
                confidence=0.8,
                inference_type="INFERRED",
                source_segment_ids=[0],
                review_status="CONFIRMED",
            )
        )
        session.add(
            LectureEvent(
                video_id=lesson_uuid,
                event_type="QUESTION",
                start_time=3,
                end_time=4,
                title="human annotation",
                confidence=1.0,
                inference_type="EXPLICIT",
                source_segment_ids=[0],
                created_by="HUMAN",
            )
        )
        session.commit()

        result = asyncio.run(
            process_lecture_events(session, semantic_env["lesson_id"], FixtureProvider())
        )
        stored = list(
            session.exec(
                select(LectureEvent).where(LectureEvent.video_id == lesson_uuid)
            ).all()
        )

    titles = {event.title for event in stored}
    generated = [event for event in stored if event.created_by == "AI" and event.review_status == "UNREVIEWED"]
    assert result.failed_chunks == 0
    assert result.persisted_events == 12
    assert result.raw_extracted_events > result.deduplicated_events == 12
    assert len(generated) == 12
    assert "stale unreviewed AI event" not in titles
    assert "confirmed AI event" in titles
    assert "human annotation" in titles
    assert all(event.source_segment_ids for event in generated)
    assert all(event.start_time <= event.end_time for event in generated)


def test_partial_chunk_failure_keeps_successful_chunk_results(semantic_env):
    provider = FixtureProvider(fail_calls={1, 2})
    with Session(semantic_env["engine"]) as session:
        result = asyncio.run(
            process_lecture_events(session, semantic_env["lesson_id"], provider)
        )

    assert result.failed_chunks == 1
    assert result.processed_chunks == result.chunk_count - 1
    assert result.persisted_events > 0


def test_reprocess_replaces_only_the_previous_ai_unreviewed_dataset(semantic_env):
    lesson_uuid = uuid.UUID(semantic_env["lesson_id"])
    with Session(semantic_env["engine"]) as session:
        asyncio.run(
            process_lecture_events(
                session,
                semantic_env["lesson_id"],
                PerChunkProvider("first snapshot"),
            )
        )
        asyncio.run(
            process_lecture_events(
                session,
                semantic_env["lesson_id"],
                PerChunkProvider("second snapshot"),
            )
        )
        stored = list(
            session.exec(
                select(LectureEvent).where(LectureEvent.video_id == lesson_uuid)
            ).all()
        )

    assert stored
    assert {event.title for event in stored} == {"second snapshot"}


def test_events_api_is_protected_and_reprocess_uses_injected_provider(semantic_env):
    lesson_id = semantic_env["lesson_id"]
    provider = FixtureProvider()
    app.dependency_overrides[get_semantic_event_provider] = lambda: provider

    assert semantic_env["anonymous"].get(f"/api/videos/{lesson_id}/events").status_code == 401
    assert semantic_env["outsider"].get(f"/api/videos/{lesson_id}/events").status_code == 403
    assert semantic_env["outsider"].post(f"/api/videos/{lesson_id}/events/reprocess").status_code == 403

    reprocess = semantic_env["owner"].post(
        f"/api/videos/{lesson_id}/events/reprocess",
        params={"output_language": "vi"},
    )
    events = semantic_env["owner"].get(f"/api/videos/{lesson_id}/events")

    assert reprocess.status_code == 200, reprocess.text
    assert reprocess.json()["persisted_events"] == 12
    assert events.status_code == 200
    body = events.json()
    assert len(body) == 12
    assert [event["start_time"] for event in body] == sorted(
        event["start_time"] for event in body
    )
    assert all(event["source_segment_ids"] for event in body)
    assert all("text" not in event for event in body)
