import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from src.backend.api import videos_router
from src.backend.auth import create_access_token, get_password_hash
from src.backend.database import get_session
from src.backend.main import app
from src.backend.models import (
    Category,
    ContentMetadata,
    Course,
    Lesson,
    Module,
    Role,
    User,
)
from src.backend.services.video_service import VideoService


@pytest.fixture
def media_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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

    videos_dir = tmp_path / "uploads" / "videos"
    audio_dir = tmp_path / "uploads" / "audio"
    transcript_dir = tmp_path / "uploads" / "transcripts"
    results_dir = tmp_path / "uploads" / "ai_results"
    thumbnail_dir = tmp_path / "uploads" / "thumbnails"
    for directory in (
        videos_dir,
        audio_dir,
        transcript_dir,
        results_dir,
        thumbnail_dir,
    ):
        directory.mkdir(parents=True)

    monkeypatch.setattr(VideoService, "UPLOAD_DIR", videos_dir)
    monkeypatch.setattr(VideoService, "AUDIO_DIR", audio_dir)
    monkeypatch.setattr(videos_router, "_TRANSCRIPTS_DIR", transcript_dir)
    monkeypatch.setattr(videos_router, "_AI_RESULTS_DIR", results_dir)
    monkeypatch.setattr(videos_router, "_THUMBNAILS_DIR", thumbnail_dir)

    with Session(engine) as session:
        teacher_role = Role(name="teacher")
        student_role = Role(name="student")
        session.add(teacher_role)
        session.add(student_role)
        session.commit()

        owner = User(
            email="media-owner@example.test",
            password_hash=get_password_hash("Password123"),
            full_name="Media Owner",
            role_id=teacher_role.id,
        )
        outsider = User(
            email="media-outsider@example.test",
            password_hash=get_password_hash("Password123"),
            full_name="Media Outsider",
            role_id=student_role.id,
        )
        session.add(owner)
        session.add(outsider)
        session.commit()

        category = Category(name="Private media")
        session.add(category)
        session.commit()
        course = Course(
            category_id=category.id,
            instructor_id=owner.id,
            title="Private media course",
        )
        session.add(course)
        session.commit()
        module = Module(course_id=course.id, title="Private module")
        session.add(module)
        session.commit()
        lesson = Lesson(
            id=uuid.uuid4(),
            module_id=module.id,
            title="Private lesson",
            status="completed",
        )
        session.add(lesson)
        session.commit()

        lesson_id = str(lesson.id)
        owner_id = owner.id

    owner_client = TestClient(app)
    owner_client.cookies.set(
        "access_token", create_access_token({"sub": "media-owner@example.test"})
    )
    outsider_client = TestClient(app)
    outsider_client.cookies.set(
        "access_token", create_access_token({"sub": "media-outsider@example.test"})
    )

    yield {
        "engine": engine,
        "lesson_id": lesson_id,
        "owner_id": owner_id,
        "owner": owner_client,
        "outsider": outsider_client,
        "anonymous": TestClient(app),
        "videos": videos_dir,
        "audio": audio_dir,
        "transcripts": transcript_dir,
        "results": results_dir,
        "thumbnails": thumbnail_dir,
    }
    app.dependency_overrides.pop(get_session, None)


def test_private_video_rejects_anonymous_query_token_and_outsider(media_env):
    lesson_id = media_env["lesson_id"]
    video_path = media_env["videos"] / f"{lesson_id}.mp4"
    video_path.write_bytes(b"0123456789")

    query_token = create_access_token({"sub": "media-owner@example.test"})
    anonymous = media_env["anonymous"].get(
        f"/api/videos/{lesson_id}/stream?token={query_token}"
    )
    outsider = media_env["outsider"].get(f"/api/videos/{lesson_id}/stream")
    public_upload = media_env["anonymous"].get(f"/uploads/videos/{lesson_id}.mp4")

    assert anonymous.status_code == 401
    assert outsider.status_code == 403
    assert public_upload.status_code == 404


def test_owner_can_stream_with_range_and_get_thumbnail(media_env):
    lesson_id = media_env["lesson_id"]
    (media_env["videos"] / f"{lesson_id}.mp4").write_bytes(b"0123456789")
    (media_env["thumbnails"] / f"{lesson_id}.jpg").write_bytes(b"jpeg")

    stream = media_env["owner"].get(
        f"/api/videos/{lesson_id}/stream",
        headers={"Range": "bytes=2-5"},
    )
    thumbnail = media_env["owner"].get(f"/api/videos/{lesson_id}/thumbnail")

    assert stream.status_code == 206
    assert stream.content == b"2345"
    assert stream.headers["content-range"] == "bytes 2-5/10"
    assert thumbnail.status_code == 200
    assert thumbnail.content == b"jpeg"


def test_video_metadata_cannot_escape_owned_upload_directory(media_env, tmp_path: Path):
    lesson_id = media_env["lesson_id"]
    outside_file = tmp_path / "outside-secret.mp4"
    outside_file.write_bytes(b"must-not-be-served")
    with Session(media_env["engine"]) as session:
        session.add(
            ContentMetadata(
                lesson_id=uuid.UUID(lesson_id),
                video_url=str(outside_file),
            )
        )
        session.commit()

    response = media_env["owner"].get(f"/api/videos/{lesson_id}/stream")

    assert response.status_code == 404
    assert response.content != outside_file.read_bytes()


def test_transcript_route_is_protected_and_uses_synthetic_fixture(media_env):
    lesson_id = media_env["lesson_id"]
    with Session(media_env["engine"]) as session:
        session.add(
            ContentMetadata(
                lesson_id=uuid.UUID(lesson_id),
                ai_analysis={
                    "transcript": {
                        "language": "vi",
                        "segments": [
                            {"start": 0.0, "end": 1.0, "text": "Synthetic segment"}
                        ],
                    }
                },
            )
        )
        session.commit()

    anonymous = media_env["anonymous"].get(f"/api/videos/{lesson_id}/transcript")
    owner = media_env["owner"].get(f"/api/videos/{lesson_id}/transcript")

    assert anonymous.status_code == 401
    assert owner.status_code == 200
    assert owner.json()["segments"][0]["text"] == "Synthetic segment"


def test_confirm_upload_rejects_foreign_s3_key(media_env):
    lesson_id = media_env["lesson_id"]
    with Session(media_env["engine"]) as session:
        lesson = session.get(Lesson, uuid.UUID(lesson_id))
        lesson.status = "pending_upload"
        session.add(lesson)
        session.commit()

    response = media_env["owner"].post(
        f"/api/videos/{lesson_id}/confirm-upload",
        json={"s3_key": f"uploads/videos/{uuid.uuid4()}.mp4"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "s3_key does not belong to this video."


def test_presigned_s3_key_is_server_issued_for_user_and_video(
    media_env, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(
        videos_router,
        "generate_presigned_upload_url",
        lambda _key, _content_type: "https://storage.example.test/signed-upload",
    )

    response = media_env["owner"].post(
        "/api/videos/presign-upload",
        json={"filename": "synthetic.mp4", "content_type": "video/mp4"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["s3_key"] == (
        f"uploads/users/{media_env['owner_id']}/videos/{body['video_id']}.mp4"
    )


def test_delete_removes_database_and_local_artifacts_idempotently(
    media_env, monkeypatch: pytest.MonkeyPatch
):
    lesson_id = media_env["lesson_id"]
    artifacts = [
        media_env["videos"] / f"{lesson_id}.mp4",
        media_env["audio"] / f"{lesson_id}.mp3",
        media_env["transcripts"] / f"{lesson_id}.json",
        media_env["thumbnails"] / f"{lesson_id}.jpg",
    ]
    for artifact in artifacts:
        artifact.write_bytes(b"synthetic")
    result_file = media_env["results"] / lesson_id / "notebook.json"
    result_file.parent.mkdir()
    result_file.write_text("{}", encoding="utf-8")

    with Session(media_env["engine"]) as session:
        session.add(
            ContentMetadata(
                lesson_id=uuid.UUID(lesson_id),
                video_url=str(artifacts[0]),
                ai_analysis={"summary": ["Synthetic summary"]},
            )
        )
        session.commit()

    monkeypatch.setattr(videos_router, "delete_s3_object", lambda _key: True)
    monkeypatch.setattr(videos_router, "delete_s3_prefix", lambda _prefix: True)

    response = media_env["owner"].delete(
        f"/api/videos/{lesson_id}", params={"reason": "Canonical cleanup test"}
    )

    assert response.status_code == 200
    assert response.json()["artifact_cleanup_complete"] is True
    assert all(not artifact.exists() for artifact in artifacts)
    assert not result_file.parent.exists()

    with Session(media_env["engine"]) as session:
        assert session.get(Lesson, uuid.UUID(lesson_id)) is None
        assert session.exec(
            select(ContentMetadata).where(ContentMetadata.lesson_id == uuid.UUID(lesson_id))
        ).first() is None
    assert media_env["owner"].get(f"/api/videos/{lesson_id}/stream").status_code == 404
