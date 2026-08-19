from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend.auth import create_access_token, get_password_hash
from src.backend.database import get_session
from src.backend.main import app
from src.backend.models import Role, User


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
        session.add(student_role)
        session.commit()
        session.refresh(student_role)

        session.add(
            User(
                email="student@example.com",
                password_hash=get_password_hash("Password123"),
                full_name="Student",
                role_id=student_role.id,
            )
        )
        session.commit()

    client = TestClient(app)
    token = create_access_token(data={"sub": "student@example.com"})
    client.cookies.set("access_token", token)
    return client


def test_upload_returns_queue_mode(monkeypatch):
    client = _build_client()

    async def fake_save_video_stream(upload_file, filename, max_size_bytes):
        return Path("data/uploads/videos") / filename

    monkeypatch.setattr("src.backend.api.videos_router.VideoService.save_video_stream", fake_save_video_stream)
    monkeypatch.setattr(
        "src.backend.api.videos_router.enqueue_pipeline_job",
        lambda **kwargs: "background_tasks",
    )

    response = client.post(
        "/api/videos/upload",
        files={"file": ("lesson.mp4", b"dummy-bytes", "video/mp4")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["queue_mode"] == "background_tasks"
    assert body["status"] == "processing"
