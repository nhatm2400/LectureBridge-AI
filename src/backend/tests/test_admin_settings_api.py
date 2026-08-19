from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from src.backend.auth import create_access_token, get_password_hash
from src.backend.database import get_session
from src.backend.main import app
from src.backend.models import Course, Lesson, Module, Role, User


def _build_client(email: str = "admin@example.com") -> tuple[TestClient, object]:
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
        admin_role = Role(name="admin")
        student_role = Role(name="student")
        session.add(admin_role)
        session.add(student_role)
        session.commit()
        session.refresh(admin_role)
        session.refresh(student_role)

        admin = User(
            email="admin@example.com",
            password_hash=get_password_hash("Password123"),
            full_name="Admin User",
            role_id=admin_role.id,
        )
        student = User(
            email="student@example.com",
            password_hash=get_password_hash("Password123"),
            full_name="Student User",
            role_id=student_role.id,
        )
        session.add(admin)
        session.add(student)
        session.commit()

    client = TestClient(app)
    token = create_access_token(data={"sub": email})
    client.cookies.set("access_token", token)
    return client, engine


def test_admin_can_toggle_public_role_registration_setting():
    client, _ = _build_client()

    get_res = client.get("/api/admin/settings")
    assert get_res.status_code == 200
    assert "allow_public_role_registration" in get_res.json()

    patch_res = client.patch("/api/admin/settings", json={"allow_public_role_registration": True})
    assert patch_res.status_code == 200
    assert patch_res.json()["allow_public_role_registration"] is True

    config_res = client.get("/api/auth/registration-config")
    assert config_res.status_code == 200
    assert config_res.json()["allow_role_registration"] is True


def test_admin_can_update_user_role():
    client, _ = _build_client()
    users_res = client.get("/api/admin/users")
    assert users_res.status_code == 200
    users = users_res.json()
    student = next(user for user in users if user["email"] == "student@example.com")

    patch_res = client.patch(f"/api/admin/users/{student['id']}/role", json={"role": "teacher"})
    assert patch_res.status_code == 200
    assert patch_res.json()["role"] == "teacher"


def test_admin_courses_preserve_utf8_vietnamese_text():
    client, engine = _build_client()

    course_title = "Kh\u00f3a h\u1ecdc l\u1eadp tr\u00ecnh web"
    course_desc = "B\u1ea1n c\u00f3 bi\u1ebft Instagram, Pinterest v\u00e0 Spotify \u0111\u1ec1u \u0111\u01b0\u1ee3c x\u00e2y d\u1ef1ng tr\u00ean Django?"
    module_title = "B\u00e0i gi\u1ea3ng 1"
    module_desc = "N\u1ed9i dung m\u1edf \u0111\u1ea7u"
    lesson_title = "Gi\u1edbi thi\u1ec7u Django c\u01a1 b\u1ea3n"

    with Session(engine) as session:
        admin = session.exec(select(User).where(User.email == "admin@example.com")).first()
        assert admin is not None
        course = Course(
            title=course_title,
            description=course_desc,
            instructor_id=admin.id,
            is_published=True,
            language="vi",
        )
        session.add(course)
        session.commit()
        session.refresh(course)

        module = Module(
            course_id=course.id,
            title=module_title,
            description=module_desc,
            sort_order=1,
        )
        session.add(module)
        session.commit()
        session.refresh(module)

        lesson = Lesson(
            module_id=module.id,
            title=lesson_title,
            sort_order=1,
        )
        session.add(lesson)
        session.commit()

    res = client.get("/api/admin/courses")
    assert res.status_code == 200
    payload = res.json()
    hit = next((item for item in payload if item["title"] == course_title), None)
    assert hit is not None
    assert hit["description"] == course_desc
    assert hit["modules"][0]["title"] == module_title
    assert hit["modules"][0]["description"] == module_desc
    assert hit["modules"][0]["lessons"][0]["title"] == lesson_title
