import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from src.backend.main import app
from src.backend.database import get_session
# Explicitly import all models to register them in SQLModel metadata
from src.backend.models import (
    user, course, content, progress, assessment, flashcard, job, system_setting, review
)
from src.backend.models.user import User, Role
from src.backend.auth import get_password_hash
from src.backend.auth import create_access_token

from sqlalchemy.pool import StaticPool

# Create an in-memory SQLite database for testing
sqlite_url = "sqlite:///:memory:"
engine = create_engine(
    sqlite_url, 
    connect_args={"check_same_thread": False}, 
    poolclass=StaticPool
)

import src.backend.database as db_module
import src.backend.main as main_module
from sqlmodel import Session as SQLSession

production_engine = db_module.engine
main_engine = main_module.engine
production_db_path = getattr(db_module, "DB_PATH", None)

@pytest.fixture(autouse=True)
def setup_db():
    # Keep the test engine override inside this fixture. A module-level override
    # leaks into tests outside tests/ during collection and leaves their app
    # lifespan pointing at an empty in-memory database.
    db_module.engine = engine
    db_module.DB_PATH = ":memory:"
    main_module.engine = engine
    main_module.Session = SQLSession
    SQLModel.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as test_session:
            yield test_session

    app.dependency_overrides[get_session] = override_get_session
    yield
    app.dependency_overrides.pop(get_session, None)
    SQLModel.metadata.drop_all(engine)
    db_module.engine = production_engine
    db_module.DB_PATH = production_db_path
    main_module.engine = main_engine

@pytest.fixture
def session():
    with Session(engine) as session:
        yield session

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture
def test_admin(session: Session):
    # Ensure role exists
    admin_role = session.exec(select(Role).where(Role.name == "admin")).first()
    if not admin_role:
        admin_role = Role(name="admin")
        session.add(admin_role)
        session.commit()
        session.refresh(admin_role)
        
    admin = User(
        email="admin_test@example.com",
        password_hash=get_password_hash("adminpass"),
        full_name="Admin Test",
        role_id=admin_role.id
    )
    session.add(admin)
    session.commit()
    session.refresh(admin)
    return admin

@pytest.fixture
def test_student(session: Session):
    # Ensure role exists
    student_role = session.exec(select(Role).where(Role.name == "student")).first()
    if not student_role:
        student_role = Role(name="student")
        session.add(student_role)
        session.commit()
        session.refresh(student_role)
        
    student = User(
        email="student_test@example.com",
        password_hash=get_password_hash("studentpass"),
        full_name="Student Test",
        role_id=student_role.id
    )
    session.add(student)
    session.commit()
    session.refresh(student)
    return student

@pytest.fixture
def admin_token(client, test_admin):
    return create_access_token({"sub": test_admin.email})

@pytest.fixture
def student_token(client, test_student):
    return create_access_token({"sub": test_student.email})
