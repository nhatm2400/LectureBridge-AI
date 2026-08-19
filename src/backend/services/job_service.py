import uuid

from sqlmodel import Session, select

from src.backend.models import ProcessingJob, Lesson
from src.backend.utils.datetime_utils import utc_now

NON_TERMINAL_JOB_STATUSES = {
    "queued",
    "downloading",
    "extracting_audio",
    "transcribing",
    "translating",
    "ai_processing",
}

TERMINAL_JOB_STATUSES = {
    "completed",
    "failed",
    "failed_restart",
}


def _normalize_lesson_id(lesson_id: str | uuid.UUID) -> uuid.UUID:
    return lesson_id if isinstance(lesson_id, uuid.UUID) else uuid.UUID(str(lesson_id))


def upsert_job_status(
    session: Session,
    *,
    lesson_id: str | uuid.UUID,
    status: str,
    progress: int | None = None,
    error_message: str | None = None,
):
    lesson_uuid = _normalize_lesson_id(lesson_id)
    statement = select(ProcessingJob).where(
        ProcessingJob.lesson_id == lesson_uuid,
        ProcessingJob.job_type == "video_pipeline",
    )
    job = session.exec(statement).first()
    if not job:
        job = ProcessingJob(lesson_id=lesson_uuid, job_type="video_pipeline", status=status)
    job.status = status
    if progress is not None:
        job.progress = progress
    if error_message is not None:
        job.error_message = error_message
    if status == "failed":
        job.attempts += 1
        job.last_failed_at = utc_now()
    job.updated_at = utc_now()
    session.add(job)
    session.commit()

def mark_stale_jobs_as_failed(session: Session):
    statement = select(ProcessingJob).where(ProcessingJob.status.in_(NON_TERMINAL_JOB_STATUSES))
    stale_jobs = session.exec(statement).all()
    for job in stale_jobs:
        job.status = "failed_restart"
        job.error_message = "Server restarted before job completion."
        job.last_failed_at = utc_now()
        job.updated_at = utc_now()
        session.add(job)
        
        # Cap nhat trang thai Lesson neu co
        lesson = session.get(Lesson, job.lesson_id)
        if lesson and lesson.status in NON_TERMINAL_JOB_STATUSES:
            lesson.status = "failed_restart"
            session.add(lesson)
    session.commit()
