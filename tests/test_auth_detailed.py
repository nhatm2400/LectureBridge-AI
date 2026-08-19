import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from src.backend.models.user import User

def test_register_success(client: TestClient, session: Session):
    response = client.post("/api/auth/register", json={
        "email": "newuser@example.com",
        "password": "StrongPassword123",
        "confirm_password": "StrongPassword123",
        "full_name": "New User",
        "role": "student"
    })
    assert response.status_code == 200
    assert response.json()["message"] == "Registration successful"
    
    # Verify in DB
    statement = select(User).where(User.email == "newuser@example.com")
    user = session.exec(statement).first()
    assert user is not None
    assert user.full_name == "New User"
    assert user.password_hash != "strongpassword123" # Should be hashed

def test_register_duplicate_email(client: TestClient, test_student):
    # Try to register with the same email as test_student
    response = client.post("/api/auth/register", json={
        "email": test_student.email,
        "password": "StrongPassword123",
        "confirm_password": "StrongPassword123",
        "full_name": "Duplicate User",
        "role": "student"
    })
    assert response.status_code == 400
    assert "Email is already in use" in response.json()["detail"]

def test_login_success(client: TestClient, test_student):
    response = client.post("/api/auth/login", data={
        "username": test_student.email,
        "password": "studentpass"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "student"
    assert "access_token" not in data
    assert "HttpOnly" in response.headers.get("set-cookie", "")

def test_login_wrong_password(client: TestClient, test_student):
    response = client.post("/api/auth/login", data={
        "username": test_student.email,
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]

def test_access_protected_route_without_token(client: TestClient):
    response = client.get("/api/videos/me")
    assert response.status_code == 401

def test_rbac_user_access_other_video(client: TestClient, student_token, session: Session):
    # Create another user and their course/lesson
    user2 = User(email="user2@example.com", password_hash="hash", full_name="User 2")
    session.add(user2)
    session.commit()
    session.refresh(user2)
    
    from src.backend.models.course import Category, Course, Module, Lesson
    cat = Category(name="Cat 2")
    session.add(cat)
    session.commit()
    
    course2 = Course(title="Course 2", instructor_id=user2.id, category_id=cat.id)
    session.add(course2)
    session.commit()
    
    mod2 = Module(title="Mod 2", course_id=course2.id)
    session.add(mod2)
    session.commit()
    
    lesson2 = Lesson(title="Private Lesson", module_id=mod2.id, status="queued")
    session.add(lesson2)
    session.commit()
    
    # Try to access lesson2 with student_token (belongs to test_student, not enrolled in course2)
    response = client.get(f"/api/videos/{lesson2.id}/status", headers={"Authorization": f"Bearer {student_token}"})
    assert response.status_code == 403
    assert "Access denied" in response.json()["detail"]
