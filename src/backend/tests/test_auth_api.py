from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend.database import get_session
from src.backend.main import app


def _build_test_client():
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
    client = TestClient(app)
    return client


def test_register_login_and_cookie_auth_flow():
    client = _build_test_client()

    register_payload = {
        "email": "student@example.com",
        "password": "Password123",
        "confirm_password": "Password123",
        "full_name": "Student User",
        "role": "student",
    }
    register_res = client.post("/api/auth/register", json=register_payload)
    assert register_res.status_code == 200
    assert register_res.json()["message"] == "Registration successful"

    login_res = client.post(
        "/api/auth/login",
        data={"username": "student@example.com", "password": "Password123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["role"] == "student"
    assert "access_token" not in login_res.json()
    cookie_header = login_res.headers.get("set-cookie", "")
    assert "access_token=" in cookie_header
    assert "HttpOnly" in cookie_header

    protected_res = client.get("/api/videos/me")
    assert protected_res.status_code == 200
    assert isinstance(protected_res.json(), list)

    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200

    # Explicitly clear TestClient cookies after logout to verify auth guard.
    client.cookies.clear()
    unauthorized_res = client.get("/api/videos/me")
    assert unauthorized_res.status_code == 401
