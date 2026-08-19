import uuid

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend.auth import create_access_token, get_password_hash
from src.backend.database import get_session
from src.backend.main import app
from src.backend.models import Category, Course, Enrollment, Lesson, Module, Role, User


def _build_client():
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
        student_role = Role(name="student")
        teacher_role = Role(name="teacher")
        session.add(student_role)
        session.add(teacher_role)
        session.commit()
        session.refresh(student_role)
        session.refresh(teacher_role)

        student = User(
            email="student-progress@example.com",
            password_hash=get_password_hash("Password123"),
            full_name="Student",
            role_id=student_role.id,
        )
        teacher = User(
            email="teacher-progress@example.com",
            password_hash=get_password_hash("Password123"),
            full_name="Teacher",
            role_id=teacher_role.id,
        )
        session.add(student)
        session.add(teacher)
        session.commit()
        session.refresh(student)
        session.refresh(teacher)

        category = Category(name="Learning")
        session.add(category)
        session.commit()
        session.refresh(category)

        course = Course(category_id=category.id, instructor_id=teacher.id, title="Progress Course")
        session.add(course)
        session.commit()
        session.refresh(course)

        module = Module(course_id=course.id, title="Module 1", sort_order=1)
        session.add(module)
        session.commit()
        session.refresh(module)

        lesson = Lesson(id=uuid.uuid4(), module_id=module.id, title="Lesson 1", content_type="video")
        lesson_id = str(lesson.id)
        session.add(lesson)
        session.add(Enrollment(user_id=student.id, course_id=course.id))
        session.commit()

    client = TestClient(app)
    token = create_access_token(data={"sub": "student-progress@example.com"})
    client.cookies.set("access_token", token)
    return client, lesson_id


def test_progress_update_persists_resume_fields_and_dashboard():
    client, lesson_id = _build_client()

    update_res = client.post(
        f"/api/student/lessons/{lesson_id}/progress",
        params={
            "progress_percent": 45,
            "status": "in_progress",
            "watched_seconds": 120,
            "last_position_seconds": 90,
            "duration_seconds": 240,
        },
    )
    assert update_res.status_code == 200, update_res.text
    body = update_res.json()
    assert body["progress_percent"] == 45
    assert body["watched_seconds"] == 120
    assert body["last_position_seconds"] == 90

    progress_res = client.get(f"/api/student/lessons/{lesson_id}/progress")
    assert progress_res.status_code == 200
    assert progress_res.json()["duration_seconds"] == 240

    dashboard_res = client.get("/api/student/dashboard")
    assert dashboard_res.status_code == 200, dashboard_res.text
    dashboard = dashboard_res.json()
    assert dashboard["stats"]["active_courses"] == 1
    assert dashboard["incomplete_lessons"][0]["lesson_id"] == lesson_id
