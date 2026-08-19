from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from src.backend.models import (
    Category,
    ContentMetadata,
    Course,
    Lesson,
    Module,
    ProcessingJob,
    Role,
    User,
)


def test_database():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        student_role = Role(name="student")
        session.add(student_role)
        session.commit()
        session.refresh(student_role)

        test_user = User(
            email="test@example.com",
            password_hash="hashed_password",
            full_name="Test User",
            role_id=student_role.id,
        )
        session.add(test_user)
        session.commit()
        session.refresh(test_user)

        category = Category(name="AI Education")
        session.add(category)
        session.commit()
        session.refresh(category)

        course = Course(
            category_id=category.id,
            instructor_id=test_user.id,
            title="Bai giang Test",
            language="vi",
        )
        session.add(course)
        session.commit()
        session.refresh(course)

        module = Module(course_id=course.id, title="Module 1", sort_order=1)
        session.add(module)
        session.commit()
        session.refresh(module)

        lesson = Lesson(
            module_id=module.id,
            title="Video bai giang",
            content_type="video",
            status="queued",
        )
        session.add(lesson)
        session.commit()
        session.refresh(lesson)

        content = ContentMetadata(
            lesson_id=lesson.id,
            video_url="data/uploads/videos/test.mp4",
            ai_analysis={"summary": "Tom tat bai giang mau"},
        )
        job = ProcessingJob(
            lesson_id=lesson.id,
            job_type="video_pipeline",
            status="queued",
        )
        session.add(content)
        session.add(job)
        session.commit()

        statement = select(Lesson).where(Lesson.module_id == module.id)
        lessons = session.exec(statement).all()
        saved_content = session.exec(
            select(ContentMetadata).where(ContentMetadata.lesson_id == lesson.id)
        ).first()
        saved_job = session.exec(
            select(ProcessingJob).where(ProcessingJob.lesson_id == lesson.id)
        ).first()

    assert len(lessons) == 1
    assert saved_content is not None
    assert saved_content.ai_analysis == {"summary": "Tom tat bai giang mau"}
    assert saved_job is not None
    assert saved_job.status == "queued"
