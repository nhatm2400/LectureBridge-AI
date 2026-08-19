import pytest
import uuid
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
from src.backend.models.course import Lesson, Course, Module, Category
from sqlmodel import Session, select

@patch("src.backend.api.videos_router.VideoService.save_video_stream")
@patch("src.backend.api.videos_router.VideoService.validate_video_duration")
@patch("src.backend.api.videos_router.enqueue_pipeline_job")
def test_upload_video_success(mock_enqueue, mock_validate, mock_save, client: TestClient, student_token, session: Session):
    mock_save.return_value = Path("data/uploads/videos/test.mp4")
    mock_validate.return_value = None
    mock_enqueue.return_value = "background_tasks"
    
    file_content = b"fake video content"
    response = client.post(
        "/api/videos/upload",
        headers={"Authorization": f"Bearer {student_token}"},
        files={"file": ("test.mp4", file_content, "video/mp4")}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "video_id" in data
    assert data["status"] == "processing"
    
    # Verify DB record
    video_id = data["video_id"]
    lesson = session.get(Lesson, uuid.UUID(video_id))
    assert lesson is not None
    assert lesson.status == "queued"
    assert lesson.title == "test.mp4"

def test_upload_invalid_format(client: TestClient, student_token):
    file_content = b"fake text content"
    response = client.post(
        "/api/videos/upload",
        headers={"Authorization": f"Bearer {student_token}"},
        files={"file": ("test.txt", file_content, "text/plain")}
    )
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

@patch("src.backend.api.videos_router.enqueue_download_and_pipeline")
def test_process_url_success(mock_enqueue, client: TestClient, student_token, session: Session):
    mock_enqueue.return_value = "background_tasks"
    
    response = client.post(
        "/api/videos/process-url",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "video_id" in data
    
    # Verify DB record
    video_id = data["video_id"]
    lesson = session.get(Lesson, uuid.UUID(video_id))
    assert lesson is not None
    assert lesson.status == "queued"

def test_get_video_status_not_found(client: TestClient, student_token):
    random_uuid = str(uuid.uuid4())
    response = client.get(
        f"/api/videos/{random_uuid}/status",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert response.status_code == 404
    assert "Khong tim thay bai hoc" in response.json()["detail"]

def test_list_my_videos(client: TestClient, student_token, test_student, session: Session):
    # Setup hierarchy for test
    category = Category(name="Test Category")
    session.add(category)
    session.flush()
    
    course = Course(title="Tu hoc ca nhan", instructor_id=test_student.id, category_id=category.id)
    session.add(course)
    session.flush()
    
    module = Module(title="Mac dinh", course_id=course.id)
    session.add(module)
    session.flush()
    
    lesson_id = uuid.uuid4()
    lesson = Lesson(id=lesson_id, title="My Video", module_id=module.id, status="queued")
    session.add(lesson)
    session.commit()
    
    response = client.get(
        "/api/videos/me",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert response.status_code == 200
    videos = response.json()
    assert any(v["id"] == str(lesson_id) for v in videos)
