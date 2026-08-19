import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from src.backend.auth import create_access_token, get_password_hash
from src.backend.database import get_session
from src.backend.main import app
from src.backend.models import (
    Category,
    ContentMetadata,
    Course,
    Enrollment,
    LectureEvent,
    LectureEventRelation,
    LectureReviewAudit,
    Lesson,
    Module,
    Role,
    User,
)
from src.backend.services.question_answer_links.provider import (
    get_question_answer_link_provider,
)


class FirstCandidateProvider:
    async def select_links(
        self,
        question,
        candidate_answers,
        supporting_segments,
        *,
        corrective_instruction=None,
    ):
        if not candidate_answers:
            return {"links": []}
        return {
            "links": [
                {
                    "question_event_id": str(question.id),
                    "answer_event_id": str(candidate_answers[0].id),
                    "confidence": 0.94,
                }
            ]
        }


def _add_event(
    session: Session,
    video_id: uuid.UUID,
    event_type: str,
    start: float,
    title: str,
    source_index: int,
) -> LectureEvent:
    event = LectureEvent(
        video_id=video_id,
        event_type=event_type,
        start_time=start,
        end_time=start + 5,
        title=title,
        description=f"Description for {title}",
        confidence=0.9,
        inference_type="EXPLICIT",
        source_segment_ids=[source_index],
    )
    session.add(event)
    return event


@pytest.fixture
def review_env():
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
    with Session(engine) as session:
        teacher_role = Role(name="teacher")
        student_role = Role(name="student")
        session.add_all([teacher_role, student_role])
        session.commit()
        owner = User(
            email="review-owner@example.test",
            password_hash=get_password_hash("Password123"),
            full_name="Review Owner",
            role_id=teacher_role.id,
        )
        student = User(
            email="review-student@example.test",
            password_hash=get_password_hash("Password123"),
            full_name="Review Student",
            role_id=student_role.id,
        )
        outsider = User(
            email="review-outsider@example.test",
            password_hash=get_password_hash("Password123"),
            full_name="Review Outsider",
            role_id=student_role.id,
        )
        session.add_all([owner, student, outsider])
        session.commit()
        category = Category(name="Human Review")
        session.add(category)
        session.commit()
        course = Course(
            category_id=category.id,
            instructor_id=owner.id,
            title="Review course",
        )
        session.add(course)
        session.commit()
        module = Module(course_id=course.id, title="Review module")
        session.add(module)
        session.commit()
        first_lesson = Lesson(
            id=uuid.uuid4(),
            module_id=module.id,
            title="Review lecture one",
        )
        second_lesson = Lesson(
            id=uuid.uuid4(),
            module_id=module.id,
            title="Review lecture two",
        )
        session.add_all([first_lesson, second_lesson])
        session.add(Enrollment(user_id=student.id, course_id=course.id))
        session.commit()

        transcript = [
            {"index": index, "start": index * 10, "end": (index + 1) * 10, "text": f"segment {index}"}
            for index in range(10)
        ]
        for lesson in (first_lesson, second_lesson):
            session.add(
                ContentMetadata(
                    lesson_id=lesson.id,
                    ai_analysis={
                        "transcript": {
                            "source_language": "vi",
                            "segments_by_language": {"vi": transcript},
                        }
                    },
                )
            )

        q1 = _add_event(session, first_lesson.id, "QUESTION", 10, "Question one", 1)
        a1 = _add_event(session, first_lesson.id, "ANSWER", 20, "Answer one", 2)
        a2 = _add_event(session, first_lesson.id, "ANSWER", 30, "Answer two", 3)
        example = _add_event(session, first_lesson.id, "EXAMPLE", 40, "Example", 4)
        q2 = _add_event(session, second_lesson.id, "QUESTION", 10, "Other question", 1)
        a3 = _add_event(session, second_lesson.id, "ANSWER", 20, "Other answer", 2)
        session.commit()
        ids = {
            "video": first_lesson.id,
            "other_video": second_lesson.id,
            "owner": owner.id,
            "student": student.id,
            "q1": q1.id,
            "a1": a1.id,
            "a2": a2.id,
            "example": example.id,
            "q2": q2.id,
            "a3": a3.id,
        }

    def client_for(email: str) -> TestClient:
        client = TestClient(app)
        client.cookies.set("access_token", create_access_token({"sub": email}))
        return client

    yield {
        "engine": engine,
        "ids": ids,
        "owner": client_for("review-owner@example.test"),
        "student": client_for("review-student@example.test"),
        "outsider": client_for("review-outsider@example.test"),
        "anonymous": TestClient(app),
    }
    app.dependency_overrides.pop(get_question_answer_link_provider, None)
    app.dependency_overrides.pop(get_session, None)


def test_relation_read_authorization_and_student_cannot_canonical_edit(review_env):
    video_id = review_env["ids"]["video"]
    event_id = review_env["ids"]["example"]

    assert review_env["anonymous"].get(f"/api/videos/{video_id}/event-relations").status_code == 401
    assert review_env["outsider"].get(f"/api/videos/{video_id}/event-relations").status_code == 403
    assert review_env["student"].get(f"/api/videos/{video_id}/event-relations").status_code == 200
    assert review_env["student"].get(
        f"/api/videos/{video_id}/events/review-access"
    ).json() == {"can_review": False}
    assert review_env["owner"].get(
        f"/api/videos/{video_id}/events/review-access"
    ).json() == {"can_review": True}
    assert review_env["student"].patch(
        f"/api/videos/{video_id}/events/{event_id}",
        json={"review_status": "CONFIRMED"},
    ).status_code == 403

    confirmed = review_env["owner"].patch(
        f"/api/videos/{video_id}/events/{event_id}",
        json={"review_status": "CONFIRMED"},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["review_status"] == "CONFIRMED"


def test_event_correction_preserves_ai_provenance_and_writes_audit(review_env):
    video_id = review_env["ids"]["video"]
    event_id = review_env["ids"]["example"]
    forged_time = review_env["owner"].patch(
        f"/api/videos/{video_id}/events/{event_id}",
        json={"review_status": "CORRECTED", "title": "Corrected", "start_time": 999},
    )
    assert forged_time.status_code == 422

    corrected = review_env["owner"].patch(
        f"/api/videos/{video_id}/events/{event_id}",
        json={
            "review_status": "CORRECTED",
            "event_type": "IMPORTANT",
            "title": "Corrected example",
            "description": "Human-reviewed description",
        },
    )
    assert corrected.status_code == 200, corrected.text
    body = corrected.json()
    assert body["created_by"] == "AI"
    assert body["review_status"] == "CORRECTED"
    assert body["event_type"] == "IMPORTANT"
    assert body["inference_type"] == "INFERRED"
    assert body["start_time"] == 40

    with Session(review_env["engine"]) as session:
        audit = session.exec(
            select(LectureReviewAudit).where(
                LectureReviewAudit.entity_id == event_id
            )
        ).one()
    assert audit.actor_user_id == review_env["ids"]["owner"]
    assert audit.before_state["title"] == "Example"
    assert audit.after_state["title"] == "Corrected example"


def test_owner_can_reject_event(review_env):
    video_id = review_env["ids"]["video"]
    response = review_env["owner"].patch(
        f"/api/videos/{video_id}/events/{review_env['ids']['example']}",
        json={"review_status": "REJECTED"},
    )
    assert response.status_code == 200
    assert response.json()["review_status"] == "REJECTED"


def test_rejecting_event_rejects_connected_relation_with_audit(review_env):
    ids = review_env["ids"]
    with Session(review_env["engine"]) as session:
        relation = LectureEventRelation(
            video_id=ids["video"],
            source_event_id=ids["q1"],
            target_event_id=ids["a1"],
            confidence=0.9,
        )
        session.add(relation)
        session.commit()
        relation_id = relation.id

    response = review_env["owner"].patch(
        f"/api/videos/{ids['video']}/events/{ids['q1']}",
        json={"review_status": "REJECTED"},
    )
    assert response.status_code == 200
    with Session(review_env["engine"]) as session:
        stored = session.get(LectureEventRelation, relation_id)
        relation_audit = session.exec(
            select(LectureReviewAudit).where(
                LectureReviewAudit.entity_id == relation_id
            )
        ).one()
    assert stored.review_status == "REJECTED"
    assert stored.reviewed_by_id == ids["owner"]
    assert relation_audit.action == "REJECTED"


def test_manual_relation_validates_type_video_self_and_duplicate(review_env):
    ids = review_env["ids"]
    route = f"/api/videos/{ids['video']}/event-relations"
    valid_payload = {
        "source_event_id": str(ids["q1"]),
        "target_event_id": str(ids["a1"]),
    }
    valid = review_env["owner"].post(route, json=valid_payload)
    assert valid.status_code == 200, valid.text
    assert valid.json()["created_by"] == "HUMAN"
    assert valid.json()["review_status"] == "CONFIRMED"

    duplicate = review_env["owner"].post(route, json=valid_payload)
    wrong_type = review_env["owner"].post(
        route,
        json={"source_event_id": str(ids["a1"]), "target_event_id": str(ids["a2"])},
    )
    cross_video = review_env["owner"].post(
        route,
        json={"source_event_id": str(ids["q1"]), "target_event_id": str(ids["a3"])},
    )
    self_link = review_env["owner"].post(
        route,
        json={"source_event_id": str(ids["q1"]), "target_event_id": str(ids["q1"])},
    )

    assert duplicate.status_code == 409
    assert wrong_type.status_code == 400
    assert cross_video.status_code == 400
    assert self_link.status_code == 400


def test_relation_confirm_correct_reject_preserves_audit(review_env):
    ids = review_env["ids"]
    with Session(review_env["engine"]) as session:
        relation = LectureEventRelation(
            video_id=ids["video"],
            source_event_id=ids["q1"],
            target_event_id=ids["a2"],
            confidence=0.88,
        )
        session.add(relation)
        session.commit()
        relation_id = relation.id

    route = f"/api/videos/{ids['video']}/event-relations/{relation_id}"
    confirmed = review_env["owner"].patch(route, json={"review_status": "CONFIRMED"})
    corrected = review_env["owner"].patch(
        route,
        json={"review_status": "CORRECTED", "target_event_id": str(ids["a1"])},
    )
    rejected = review_env["owner"].patch(route, json={"review_status": "REJECTED"})

    assert confirmed.status_code == 200
    assert corrected.status_code == 200
    assert corrected.json()["target_event_id"] == str(ids["a1"])
    assert rejected.status_code == 200
    assert rejected.json()["review_status"] == "REJECTED"
    with Session(review_env["engine"]) as session:
        audits = list(
            session.exec(
                select(LectureReviewAudit).where(
                    LectureReviewAudit.entity_id == relation_id
                )
            ).all()
        )
    assert [audit.action for audit in audits] == ["CONFIRMED", "CORRECTED", "REJECTED"]
    assert all(audit.actor_user_id == ids["owner"] for audit in audits)


def test_relation_reprocess_is_owner_only_and_uses_injected_provider(review_env):
    ids = review_env["ids"]
    app.dependency_overrides[get_question_answer_link_provider] = (
        lambda: FirstCandidateProvider()
    )
    route = f"/api/videos/{ids['video']}/event-relations/reprocess"

    assert review_env["student"].post(route).status_code == 403
    response = review_env["owner"].post(route)

    assert response.status_code == 200, response.text
    assert response.json()["questions_considered"] == 1
    assert response.json()["relations_created"] == 1
