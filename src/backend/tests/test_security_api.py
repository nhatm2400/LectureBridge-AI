import uuid

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend.auth import create_access_token, get_password_hash
from src.backend.database import get_session
from src.backend.main import app
from src.backend.models import Category, Course, Enrollment, Lesson, Module, Role, User


def _seed_security_data():
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

        owner = User(
            email="owner@example.com",
            password_hash=get_password_hash("Password123"),
            full_name="Owner Teacher",
            role_id=teacher_role.id,
        )
        outsider = User(
            email="outsider@example.com",
            password_hash=get_password_hash("Password123"),
            full_name="Outsider Student",
            role_id=student_role.id,
        )
        enrolled = User(
            email="enrolled@example.com",
            password_hash=get_password_hash("Password123"),
            full_name="Enrolled Student",
            role_id=student_role.id,
        )
        session.add(owner)
        session.add(outsider)
        session.add(enrolled)
        session.commit()
        session.refresh(owner)
        session.refresh(outsider)
        session.refresh(enrolled)

        category = Category(name="Security")
        session.add(category)
        session.commit()
        session.refresh(category)

        course = Course(
            category_id=category.id,
            instructor_id=owner.id,
            title="Private Course",
        )
        session.add(course)
        session.commit()
        session.refresh(course)

        module = Module(course_id=course.id, title="Private Module")
        session.add(module)
        session.commit()
        session.refresh(module)

        lesson = Lesson(
            id=uuid.uuid4(),
            module_id=module.id,
            title="Private Lesson",
            content_type="video",
            status="completed",
        )
        session.add(lesson)
        session.add(Enrollment(user_id=enrolled.id, course_id=course.id))
        session.commit()
        session.refresh(lesson)

        return str(lesson.id)


def _client_for(email: str) -> TestClient:
    client = TestClient(app)
    token = create_access_token(data={"sub": email})
    client.cookies.set("access_token", token)
    return client


def test_video_status_denies_user_without_course_access():
    lesson_id = _seed_security_data()
    client = _client_for("outsider@example.com")

    response = client.get(f"/api/videos/{lesson_id}/status")

    assert response.status_code == 403


def test_video_status_allows_enrolled_user():
    lesson_id = _seed_security_data()
    client = _client_for("enrolled@example.com")

    response = client.get(f"/api/videos/{lesson_id}/status")

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_upload_rejects_unsupported_mime_type():
    _seed_security_data()
    client = _client_for("enrolled@example.com")

    response = client.post(
        "/api/videos/upload",
        files={"file": ("lesson.mp4", b"not-a-video", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported video MIME type."
