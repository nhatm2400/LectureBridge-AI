import asyncio
import logging
import os
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete
from sqlmodel import Session, select

from src.backend import config
from src.backend.api.deps import check_video_access, validate_external_video_url
from src.backend.auth import get_current_user
from src.backend.database import get_session
from src.backend.models import (
    Category,
    Flashcard,
    ProcessingJob,
    User,
    Course,
    Lesson,
    ContentMetadata,
    DeletionAudit,
    Quiz,
    Question,
    QuestionOption,
    QuizAttempt,
    UserFlashcardProgress,
    Module,
    Enrollment,
    UserProgress,
    LectureEvent,
    LectureEventRelation,
    LectureReviewAudit,
)
from src.backend.services.job_service import upsert_job_status
from src.backend.services.queue_service import enqueue_download_and_pipeline, enqueue_pipeline_job
from src.backend.services.rate_limit_service import rate_limit
from src.backend.services.storage_service import (
    delete_s3_object,
    delete_s3_prefix,
    download_from_s3,
    generate_presigned_upload_url,
    generate_presigned_url,
    get_upload_capabilities,
    s3_object_exists,
)
from src.backend.services.video_service import VideoService
from src.backend.services.semantic_events.provider import (
    SemanticEventProvider,
    get_semantic_event_provider,
)
from src.backend.services.semantic_events.service import (
    TranscriptNotFoundError,
    list_lecture_events,
    process_lecture_events,
)
from src.backend.services.question_answer_links.provider import (
    QuestionAnswerLinkProvider,
    get_question_answer_link_provider,
)
from src.backend.services.question_answer_links.review import (
    DuplicateRelationError,
    ReviewEntityNotFoundError,
    create_manual_relation,
    review_event,
    review_relation,
)
from src.backend.services.question_answer_links.schemas import (
    EventReviewRequest,
    ManualRelationRequest,
    RelationReviewRequest,
)
from src.backend.services.question_answer_links.service import (
    RelationValidationError,
    list_event_relations,
    process_question_answer_links,
)
from src.backend.services.lecture_grounding.learning import source_aware_highlights
from src.backend.services.lecture_grounding.provider import (
    LectureGroundingProvider,
    get_lecture_grounding_provider,
)
from src.backend.services.lecture_grounding.schemas import (
    AskLectureRequest,
    ContextRecoveryRequest,
)
from src.backend.services.lecture_grounding.service import (
    ask_lecture,
    recover_lecture_context,
)
from src.backend.utils.text_encoding import normalize_text_utf8

router = APIRouter(prefix="/api/videos", tags=["videos"])
logger = logging.getLogger(__name__)

_UPLOADS_ROOT = Path(config.UPLOADS_DIR)
_THUMBNAILS_DIR = _UPLOADS_ROOT / "thumbnails"
_TRANSCRIPTS_DIR = _UPLOADS_ROOT / "transcripts"
_AI_RESULTS_DIR = _UPLOADS_ROOT / "ai_results"


def _fix_mojibake_text(value: str | None) -> str:
    return normalize_text_utf8(value)


def _create_deletion_audit(
    *,
    session: Session,
    entity_type: str,
    entity_id: str,
    entity_display_name: str | None,
    reason: str,
    actor: User,
) -> None:
    session.add(
        DeletionAudit(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_display_name=entity_display_name,
            deleted_by_user_id=actor.id,
            deleted_by_email=actor.email,
            reason=reason.strip(),
        )
    )


def _parse_lesson_id(lesson_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(lesson_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid video id.")


def _is_path_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except (OSError, ValueError):
        return False


def _owned_file(candidate: Path, root: Path, video_id: str) -> Path | None:
    if not _is_path_within(candidate, root):
        return None
    if candidate.stem != video_id or candidate.suffix.lower() not in config.ALLOWED_VIDEO_EXTENSIONS:
        return None
    return candidate if candidate.exists() and candidate.is_file() else None


def _validated_video_s3_key(video_id: str, value: str | None) -> str | None:
    normalized = (value or "").strip().replace("\\", "/")
    parts = normalized.split("/")
    if len(parts) != 5 or parts[:2] != ["uploads", "users"] or parts[3] != "videos":
        return None
    try:
        uuid.UUID(parts[2])
    except ValueError:
        return None
    file_part = Path(parts[4])
    if file_part.stem != str(_parse_lesson_id(video_id)):
        return None
    if file_part.suffix.lower() not in config.ALLOWED_VIDEO_EXTENSIONS:
        return None
    return normalized


def _find_existing_video_path(lesson_id: str, session: Session) -> Path | None:
    lesson_uuid = _parse_lesson_id(lesson_id)
    canonical_id = str(lesson_uuid)
    content = session.exec(select(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid)).first()
    if content and content.video_url:
        raw_path = str(content.video_url).strip()
        normalized = raw_path.replace("\\", "/")
        candidates = [
            Path(raw_path),
            Path(normalized),
            VideoService.UPLOAD_DIR / Path(normalized).name,
        ]

        for candidate in candidates:
            owned = _owned_file(candidate, VideoService.UPLOAD_DIR, canonical_id)
            if owned:
                return owned

    for candidate in VideoService.UPLOAD_DIR.glob(f"{canonical_id}.*"):
        owned = _owned_file(candidate, VideoService.UPLOAD_DIR, canonical_id)
        if owned:
            return owned
    return None


def _get_ai_analysis(video_id: str, session: Session) -> dict:
    lesson_uuid = _parse_lesson_id(video_id)
    content = session.exec(
        select(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid)
    ).first()
    return content.ai_analysis if content and isinstance(content.ai_analysis, dict) else {}


def _get_content_metadata(video_id: str, session: Session) -> ContentMetadata | None:
    lesson_uuid = _parse_lesson_id(video_id)
    return session.exec(
        select(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid)
    ).first()


def _normalize_output_language(value: object) -> str:
    output_language = str(value or "vi").strip().lower()
    if output_language not in {"vi", "en"}:
        raise HTTPException(
            status_code=422,
            detail="output_language must be 'vi' or 'en'.",
        )
    return output_language


def _stored_output_language(content: ContentMetadata | None) -> str:
    analysis = content.ai_analysis if content and isinstance(content.ai_analysis, dict) else {}
    return _normalize_output_language(analysis.get("output_language", "vi"))


def _set_stored_output_language(
    content: ContentMetadata,
    output_language: str,
) -> None:
    analysis = dict(content.ai_analysis) if isinstance(content.ai_analysis, dict) else {}
    analysis["output_language"] = _normalize_output_language(output_language)
    content.ai_analysis = analysis


def _remove_owned_path(path: Path, root: Path) -> bool:
    """Remove a file/directory only when it resolves inside its artifact root."""
    if not _is_path_within(path, root):
        return False
    try:
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()
        return True
    except OSError:
        return False


def _cleanup_video_artifacts(
    video_id: str,
    content: ContentMetadata | None,
) -> int:
    """Best-effort, idempotent cleanup for all artifacts owned by one lesson."""
    failures = 0
    file_patterns = (
        (VideoService.UPLOAD_DIR, f"{video_id}.*"),
        (VideoService.AUDIO_DIR, f"{video_id}.*"),
        (_TRANSCRIPTS_DIR, f"{video_id}.*"),
        (_THUMBNAILS_DIR, f"{video_id}.*"),
    )
    for root, pattern in file_patterns:
        if not root.exists():
            continue
        for path in root.glob(pattern):
            if not _remove_owned_path(path, root):
                failures += 1

    result_dir = _AI_RESULTS_DIR / video_id
    if result_dir.exists() and not _remove_owned_path(result_dir, _AI_RESULTS_DIR):
        failures += 1

    issued_video_key = _validated_video_s3_key(video_id, content.video_url if content else None)
    if issued_video_key:
        delete_s3_object(issued_video_key)

    for ext in config.ALLOWED_VIDEO_EXTENSIONS:
        delete_s3_object(f"uploads/{video_id}{ext}")
        delete_s3_object(f"uploads/videos/{video_id}{ext}")
    delete_s3_object(f"uploads/audio/{video_id}.mp3")
    delete_s3_object(f"uploads/transcripts/{video_id}.json")
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        delete_s3_object(f"uploads/thumbnails/{video_id}{ext}")
    delete_s3_prefix(f"uploads/ai_results/{video_id}/")
    return failures


def _ensure_lesson_owner_or_admin(video_id: str, current_user: User, session: Session) -> Lesson:
    lesson = check_video_access(video_id, current_user, session)
    role_name = (current_user.role.name if current_user.role else "student").lower()
    if role_name == "admin":
        return lesson
    if lesson.module:
        course = session.get(Course, lesson.module.course_id)
        if course and course.instructor_id == current_user.id:
            return lesson
    raise HTTPException(status_code=403, detail="Only course teacher/admin can delete lesson videos.")


def _ensure_lesson_reviewer(video_id: str, current_user: User, session: Session) -> Lesson:
    lesson = check_video_access(video_id, current_user, session)
    if _can_review_lesson(lesson, current_user, session):
        return lesson
    raise HTTPException(
        status_code=403,
        detail="Only the course instructor or an admin can review lecture intelligence.",
    )


def _can_review_lesson(lesson: Lesson, current_user: User, session: Session) -> bool:
    role_name = (current_user.role.name if current_user.role else "student").lower()
    if role_name == "admin":
        return True
    if lesson.module:
        course = session.get(Course, lesson.module.course_id)
        if course and course.instructor_id == current_user.id:
            return True
    return False


def _build_personal_course_title(user: User) -> str:
    display_name = (user.full_name or "").strip()
    if not display_name:
        display_name = user.email.split("@")[0]
    return f"Khóa học cá nhân của {display_name}"


async def get_or_create_default_hierarchy(session: Session, user: User):
    # Get or create "Chung" category
    category = session.exec(select(Category).where(Category.name == "Chung")).first()
    if not category:
        category = Category(name="Chung", description="Danh muc chung")
        session.add(category)
        session.flush()
    
    personal_title = _build_personal_course_title(user)
    # Reuse the existing course title when present; otherwise personalize it.
    course = session.exec(
        select(Course).where(
            Course.instructor_id == user.id,
            Course.title.in_(["Tu hoc ca nhan", personal_title]),
        )
    ).first()
    if not course:
        course = Course(
            category_id=category.id,
            instructor_id=user.id,
            title=personal_title,
            description="Không gian tự học cá nhân cho các video bạn tự tải lên.",
            is_published=False,
        )
        session.add(course)
        session.flush()
    elif course.title != personal_title:
        course.title = personal_title
        session.add(course)
        session.flush()
    
    # Get or create "Default" module
    module = session.exec(select(Module).where(Module.course_id == course.id)).first()
    if not module:
        module = Module(
            course_id=course.id,
            title="Video tự học",
            sort_order=1
        )
        session.add(module)
        session.flush()
    
    return module


def _role_name(user: User) -> str:
    return (user.role.name if user.role else "student").lower()


def _ensure_teacher_module(module_id: str | None, current_user: User, session: Session) -> Module | None:
    if not module_id:
        return None
    try:
        module_uuid = uuid.UUID(str(module_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid module id.")

    module = session.get(Module, module_uuid)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found.")

    course = session.get(Course, module.course_id)
    role_name = _role_name(current_user)
    if role_name == "admin" or (course and course.instructor_id == current_user.id):
        return module
    raise HTTPException(status_code=403, detail="Only course teacher/admin can upload lesson videos.")


async def _create_lesson_and_enqueue(
    *,
    file: UploadFile,
    module_id: str | None,
    current_user: User,
    session: Session,
    background_tasks: BackgroundTasks,
    video_title: str | None = None,
    output_language: str = "vi",
) -> dict:
    lesson_uuid = uuid.uuid4()
    lesson_id = str(lesson_uuid)
    output_language = _normalize_output_language(output_language)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in config.ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file format for {file.filename}.")
    content_type = (file.content_type or "").lower()
    if content_type not in config.ALLOWED_VIDEO_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported video MIME type.")

    filename = f"{lesson_id}{ext}"
    max_upload_size_bytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    video_path = await VideoService.save_video_stream(
        upload_file=file,
        filename=filename,
        max_size_bytes=max_upload_size_bytes,
    )
    VideoService.validate_video_duration(video_path)
    await asyncio.to_thread(VideoService.normalize_mp4_for_browser, video_path)

    target_module = _ensure_teacher_module(module_id, current_user, session)
    module = target_module or await get_or_create_default_hierarchy(session, current_user)
    resolved_video_title = (video_title or "").strip() or file.filename

    lesson = Lesson(
        id=lesson_uuid,
        module_id=module.id,
        title=resolved_video_title,
        content_type="video",
        status="queued",
        duration_minutes=0,
        sort_order=0
    )
    duration_seconds = VideoService.get_video_duration_seconds(video_path)
    if duration_seconds:
        lesson.duration_minutes = max(1, int(round(duration_seconds / 60)))
    session.add(lesson)
    session.add(
        ContentMetadata(
            lesson_id=lesson_uuid,
            video_url=str(video_path),
            ai_analysis={"output_language": output_language},
        )
    )
    session.commit()

    if target_module is None and _role_name(current_user) == "student":
        existing_enrollment = session.exec(
            select(Enrollment).where(
                Enrollment.user_id == current_user.id,
                Enrollment.course_id == module.course_id,
            )
        ).first()
        if not existing_enrollment:
            session.add(Enrollment(user_id=current_user.id, course_id=module.course_id))
            session.commit()

    upsert_job_status(session, lesson_id=lesson_id, status="queued", progress=0)
    mode = enqueue_pipeline_job(
        video_id=lesson_id,
        video_path=str(video_path),
        output_language=output_language,
        fallback_task_adder=background_tasks.add_task,
    )
    return {
        "video_id": lesson_id,
        "status": "processing",
        "queue_mode": mode,
        "message": "Video uploaded and queued for processing.",
        "filename": file.filename,
        "output_language": output_language,
    }


@router.get("/upload-capabilities")
async def upload_capabilities(
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated browser upload mode selected by backend config."""
    del current_user
    return get_upload_capabilities()


@router.post("/presign-upload")
async def presign_upload(
    data: dict,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Create lesson record and return a presigned S3 PUT URL for direct browser upload."""
    filename = data.get("filename", "video.mp4")
    content_type = data.get("content_type", "video/mp4")
    module_id = data.get("module_id")
    video_title = (data.get("video_title") or "").strip() or filename
    output_language = _normalize_output_language(data.get("output_language", "vi"))

    ext = os.path.splitext(filename)[1].lower()
    if ext not in config.ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {filename}")
    if content_type.lower() not in config.ALLOWED_VIDEO_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported video MIME type.")

    lesson_uuid = uuid.uuid4()
    lesson_id = str(lesson_uuid)
    s3_key = f"uploads/users/{current_user.id}/videos/{lesson_id}{ext}"

    upload_url = generate_presigned_upload_url(s3_key, content_type)
    if not upload_url:
        raise HTTPException(
            status_code=503,
            detail=(
                "Direct object storage upload is unavailable. "
                "Contact an administrator to check the storage configuration."
            ),
        )

    target_module = _ensure_teacher_module(module_id, current_user, session)
    module = target_module or await get_or_create_default_hierarchy(session, current_user)

    lesson = Lesson(
        id=lesson_uuid,
        module_id=module.id,
        title=video_title,
        content_type="video",
        status="pending_upload",
        duration_minutes=0,
        sort_order=0,
    )
    session.add(lesson)
    session.add(
        ContentMetadata(
            lesson_id=lesson_uuid,
            video_url=s3_key,
            ai_analysis={"output_language": output_language},
        )
    )

    if target_module is None and _role_name(current_user) == "student":
        existing = session.exec(
            select(Enrollment).where(
                Enrollment.user_id == current_user.id,
                Enrollment.course_id == module.course_id,
            )
        ).first()
        if not existing:
            session.add(Enrollment(user_id=current_user.id, course_id=module.course_id))

    session.commit()
    return {
        "video_id": lesson_id,
        "upload_url": upload_url,
        "s3_key": s3_key,
        "expires_in": 3600,
        "output_language": output_language,
    }


@router.post("/{video_id}/confirm-upload")
async def confirm_upload(
    video_id: str,
    background_tasks: BackgroundTasks,
    data: dict,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Called after browser finishes uploading to S3. Downloads file and enqueues pipeline."""
    lesson = check_video_access(video_id, current_user, session)
    if lesson.status != "pending_upload":
        raise HTTPException(status_code=409, detail="Upload is not pending confirmation.")

    canonical_id = str(_parse_lesson_id(video_id))
    s3_key = str(data.get("s3_key", "")).strip()
    if not s3_key:
        raise HTTPException(status_code=400, detail="s3_key is required.")

    content = _get_content_metadata(canonical_id, session)
    issued_key = _validated_video_s3_key(canonical_id, content.video_url if content else None)
    ext = os.path.splitext(s3_key)[1].lower()
    if not issued_key or s3_key != issued_key:
        raise HTTPException(status_code=400, detail="s3_key does not belong to this video.")

    local_path = VideoService.UPLOAD_DIR / f"{canonical_id}{ext}"
    VideoService.ensure_dirs()

    if not download_from_s3(s3_key, local_path):
        raise HTTPException(status_code=502, detail="Failed to download video from S3.")

    VideoService.validate_video_duration(local_path)
    await asyncio.to_thread(VideoService.normalize_mp4_for_browser, local_path)

    duration_seconds = VideoService.get_video_duration_seconds(local_path)
    if duration_seconds:
        lesson.duration_minutes = max(1, int(round(duration_seconds / 60)))
    lesson.status = "queued"
    session.add(lesson)
    session.commit()

    upsert_job_status(session, lesson_id=video_id, status="queued", progress=0)
    mode = enqueue_pipeline_job(
        video_id=video_id,
        video_path=str(local_path),
        output_language=_stored_output_language(content),
        fallback_task_adder=background_tasks.add_task,
    )
    return {
        "video_id": video_id,
        "status": "processing",
        "queue_mode": mode,
        "message": "Video upload confirmed and queued for processing.",
    }


@router.post("/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    _: None = Depends(rate_limit("upload", config.UPLOAD_RATE_LIMIT)),
    file: UploadFile = File(...),
    module_id: str | None = Form(default=None),
    video_title: str | None = Form(default=None),
    output_language: str = Form(default="vi", pattern="^(vi|en)$"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    try:
        return await _create_lesson_and_enqueue(
            file=file,
            module_id=module_id,
            current_user=current_user,
            session=session,
            background_tasks=background_tasks,
            video_title=video_title,
            output_language=output_language,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        message = str(exc)
        status_code = 413 if "size" in message.lower() or "large" in message.lower() else 400
        raise HTTPException(
            status_code=status_code,
            detail=message or f"File too large. Maximum allowed size is {config.MAX_UPLOAD_SIZE_MB} MB.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-batch")
async def upload_videos_batch(
    background_tasks: BackgroundTasks,
    _: None = Depends(rate_limit("upload", config.UPLOAD_RATE_LIMIT)),
    files: list[UploadFile] = File(...),
    module_id: str | None = Form(default=None),
    video_titles: list[str] | None = Form(default=None),
    output_language: str = Form(default="vi", pattern="^(vi|en)$"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files per batch.")

    results: list[dict] = []
    for index, file in enumerate(files):
        video_title = None
        if video_titles and index < len(video_titles):
            video_title = (video_titles[index] or "").strip() or None
        try:
            res = await _create_lesson_and_enqueue(
                file=file,
                module_id=module_id,
                current_user=current_user,
                session=session,
                background_tasks=background_tasks,
                video_title=video_title,
                output_language=output_language,
            )
            results.append({"ok": True, **res})
        except HTTPException as exc:
            results.append({"ok": False, "filename": file.filename, "error": exc.detail})
        except Exception as exc:
            results.append({"ok": False, "filename": file.filename, "error": str(exc)})

    success_count = len([r for r in results if r.get("ok")])
    return {
        "status": "completed",
        "total": len(files),
        "success_count": success_count,
        "failed_count": len(files) - success_count,
        "items": results,
    }


@router.post("/process-url")
async def process_url(
    background_tasks: BackgroundTasks,
    data: dict,
    _: None = Depends(rate_limit("upload", config.UPLOAD_RATE_LIMIT)),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    url = validate_external_video_url(data.get("url"))
    output_language = _normalize_output_language(data.get("output_language", "vi"))
    lesson_uuid = uuid.uuid4()
    lesson_id = str(lesson_uuid)
    
    module = await get_or_create_default_hierarchy(session, current_user)
    
    lesson = Lesson(
        id=lesson_uuid,
        module_id=module.id,
        title=f"Video from URL: {url[:30]}...",
        content_type="video",
        status="queued",
        sort_order=0
    )
    session.add(lesson)
    session.add(
        ContentMetadata(
            lesson_id=lesson_uuid,
            ai_analysis={"output_language": output_language},
        )
    )
    session.commit()
    
    upsert_job_status(session, lesson_id=lesson_id, status="queued", progress=0)
    mode = enqueue_download_and_pipeline(
        video_id=lesson_id,
        url=url,
        output_language=output_language,
        fallback_task_adder=background_tasks.add_task,
    )
    return {
        "video_id": lesson_id,
        "status": "processing",
        "queue_mode": mode,
        "message": "URL accepted and download has started.",
    }


@router.get("/me")
async def list_my_videos(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    module = await get_or_create_default_hierarchy(session, current_user)
    lessons = session.exec(
        select(Lesson).where(Lesson.module_id == module.id).order_by(Lesson.created_at.desc())
    ).all()
    result = []
    for lesson in lessons:
        content = session.exec(select(ContentMetadata).where(ContentMetadata.lesson_id == lesson.id)).first()
        progress = session.exec(
            select(UserProgress).where(
                UserProgress.user_id == current_user.id,
                UserProgress.lesson_id == lesson.id,
            )
        ).first()
        result.append(
            {
                "id": str(lesson.id),
                "title": lesson.title,
                "status": lesson.status,
                "created_at": lesson.created_at,
                "video_url": content.video_url if content else None,
                "progress_percent": progress.progress_percent if progress else 0,
                "completion_status": progress.completion_status if progress else "not_started",
            }
        )
    return result


@router.post("/{video_id}/reprocess")
async def reprocess_video(
    video_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = check_video_access(video_id, current_user, session)
    video_path = _find_existing_video_path(video_id, session)
    if not video_path:
        raise HTTPException(
            status_code=404,
            detail="Khong tim thay file video da upload de xu ly lai.",
        )

    lesson.status = "queued"
    session.add(lesson)
    session.commit()
    upsert_job_status(session, lesson_id=video_id, status="queued", progress=0, error_message="")

    mode = enqueue_pipeline_job(
        video_id=video_id,
        video_path=str(video_path),
        output_language=_stored_output_language(
            _get_content_metadata(video_id, session)
        ),
        fallback_task_adder=background_tasks.add_task,
    )
    return {
        "video_id": video_id,
        "status": "processing",
        "queue_mode": mode,
        "message": "Video reprocess has been queued.",
    }


@router.get("/{video_id}/status")
async def get_video_status(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = check_video_access(video_id, current_user, session)
    return {"video_id": video_id, "status": lesson.status}


@router.get("/{video_id}/job-status")
async def get_video_job_status(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    lesson_uuid = _parse_lesson_id(video_id)
    statement = select(ProcessingJob).where(
        ProcessingJob.lesson_id == lesson_uuid,
        ProcessingJob.job_type == "video_pipeline",
    )
    job = session.exec(statement).first()
    if not job:
        return {"video_id": video_id, "status": "not_found", "progress": 0}
    return {
        "video_id": video_id,
        "status": job.status,
        "progress": job.progress,
        "error_message": job.error_message,
        "attempts": job.attempts,
        "last_failed_at": job.last_failed_at,
        "updated_at": job.updated_at,
    }


@router.get("/{video_id}/transcript")
async def get_transcript(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    ai_analysis = _get_ai_analysis(video_id, session)
    if "transcript" not in ai_analysis:
        return {"video_id": video_id, "message": "Phu de chua san sang."}
    transcript = ai_analysis["transcript"]
    if isinstance(transcript, dict) and "segments_by_language" not in transcript:
        segments = transcript.get("segments", [])
        lang = transcript.get("language", "vi")
        transcript["segments_by_language"] = {lang: segments}
        transcript["available_languages"] = [lang]
    return transcript


def _serialize_lecture_event(event: LectureEvent) -> dict:
    return {
        "id": str(event.id),
        "video_id": str(event.video_id),
        "event_type": event.event_type,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "title": event.title,
        "description": event.description,
        "confidence": event.confidence,
        "inference_type": event.inference_type,
        "source_segment_ids": event.source_segment_ids,
        "created_by": event.created_by,
        "review_status": event.review_status,
        "created_at": event.created_at.isoformat(),
        "updated_at": event.updated_at.isoformat(),
    }


def _serialize_event_relation(relation: LectureEventRelation) -> dict:
    return {
        "id": str(relation.id),
        "video_id": str(relation.video_id),
        "source_event_id": str(relation.source_event_id),
        "target_event_id": str(relation.target_event_id),
        "relation_type": relation.relation_type,
        "confidence": relation.confidence,
        "created_by": relation.created_by,
        "review_status": relation.review_status,
        "reviewed_by_id": (
            str(relation.reviewed_by_id) if relation.reviewed_by_id else None
        ),
        "created_at": relation.created_at.isoformat(),
        "updated_at": relation.updated_at.isoformat(),
    }


@router.get("/{video_id}/events")
async def get_lecture_events(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    return [
        _serialize_lecture_event(event)
        for event in list_lecture_events(session, video_id)
    ]


@router.get("/{video_id}/events/review-access")
async def get_lecture_review_access(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = check_video_access(video_id, current_user, session)
    return {"can_review": _can_review_lesson(lesson, current_user, session)}


@router.post("/{video_id}/events/reprocess")
async def reprocess_lecture_events(
    video_id: str,
    output_language: str = Query(default="vi", pattern="^(vi|en)$"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    provider: SemanticEventProvider = Depends(get_semantic_event_provider),
):
    _ensure_lesson_reviewer(video_id, current_user, session)
    try:
        result = await process_lecture_events(
            session,
            video_id,
            provider,
            output_language=output_language,
        )
    except TranscriptNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    content = _get_content_metadata(video_id, session)
    if content:
        _set_stored_output_language(content, output_language)
        updated_analysis = dict(content.ai_analysis or {})
        updated_analysis["lecture_event_output_language"] = output_language
        content.ai_analysis = updated_analysis
        session.add(content)
        session.commit()
    return result.model_dump()


@router.patch("/{video_id}/events/{event_id}")
async def patch_lecture_event(
    video_id: str,
    event_id: uuid.UUID,
    payload: EventReviewRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = _ensure_lesson_reviewer(video_id, current_user, session)
    try:
        event = review_event(
            session,
            video_id=lesson.id,
            event_id=event_id,
            actor_user_id=current_user.id,
            review_status=payload.review_status,
            event_type=payload.event_type,
            title=payload.title,
            description=payload.description,
        )
    except ReviewEntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _serialize_lecture_event(event)


@router.get("/{video_id}/event-relations")
async def get_lecture_event_relations(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    return [
        _serialize_event_relation(relation)
        for relation in list_event_relations(session, video_id)
    ]


@router.post("/{video_id}/event-relations/reprocess")
async def reprocess_lecture_event_relations(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    provider: QuestionAnswerLinkProvider = Depends(
        get_question_answer_link_provider
    ),
):
    _ensure_lesson_reviewer(video_id, current_user, session)
    try:
        result = await process_question_answer_links(session, video_id, provider)
    except TranscriptNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return result.model_dump()


@router.post("/{video_id}/event-relations")
async def post_manual_lecture_event_relation(
    video_id: str,
    payload: ManualRelationRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = _ensure_lesson_reviewer(video_id, current_user, session)
    try:
        relation = create_manual_relation(
            session,
            video_id=lesson.id,
            source_event_id=payload.source_event_id,
            target_event_id=payload.target_event_id,
            actor_user_id=current_user.id,
        )
    except ReviewEntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RelationValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DuplicateRelationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _serialize_event_relation(relation)


@router.patch("/{video_id}/event-relations/{relation_id}")
async def patch_lecture_event_relation(
    video_id: str,
    relation_id: uuid.UUID,
    payload: RelationReviewRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = _ensure_lesson_reviewer(video_id, current_user, session)
    try:
        relation = review_relation(
            session,
            video_id=lesson.id,
            relation_id=relation_id,
            actor_user_id=current_user.id,
            review_status=payload.review_status,
            target_event_id=payload.target_event_id,
        )
    except ReviewEntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RelationValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DuplicateRelationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _serialize_event_relation(relation)


@router.get("/{video_id}/artifacts/status")
async def get_artifact_status(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    ai_analysis = _get_ai_analysis(video_id, session)
    return {
        "video_id": video_id,
        "artifact_status": ai_analysis.get("artifact_status", {}),
    }


@router.post("/{video_id}/context-recovery")
async def post_context_recovery(
    video_id: str,
    payload: ContextRecoveryRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    provider: LectureGroundingProvider = Depends(get_lecture_grounding_provider),
    _: None = Depends(
        rate_limit("context_recovery", config.CONTEXT_RECOVERY_RATE_LIMIT)
    ),
):
    check_video_access(video_id, current_user, session)
    try:
        response = await recover_lecture_context(
            session,
            video_id,
            provider,
            current_time=payload.current_time,
            window_seconds=payload.window_seconds,
            output_language=payload.output_language,
        )
    except TranscriptNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return response.model_dump()


@router.post("/{video_id}/ask")
async def post_ask_lecture(
    video_id: str,
    payload: AskLectureRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    provider: LectureGroundingProvider = Depends(get_lecture_grounding_provider),
    _: None = Depends(rate_limit("ask_lecture", config.ASK_LECTURE_RATE_LIMIT)),
):
    check_video_access(video_id, current_user, session)
    if len(payload.question) > config.ASK_LECTURE_MAX_QUESTION_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=(
                "Question exceeds the maximum length of "
                f"{config.ASK_LECTURE_MAX_QUESTION_LENGTH} characters."
            ),
        )
    try:
        response = await ask_lecture(
            session,
            video_id,
            provider,
            question=payload.question,
            output_language=payload.output_language,
        )
    except TranscriptNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return response.model_dump()


@router.post("/{video_id}/learning-artifacts/reprocess")
async def reprocess_learning_artifacts(
    video_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = _ensure_lesson_reviewer(video_id, current_user, session)
    video_path = _find_existing_video_path(video_id, session)
    if not video_path:
        raise HTTPException(status_code=404, detail="Uploaded video file is not available.")
    content = _get_content_metadata(video_id, session)
    if content and isinstance(content.ai_analysis, dict):
        updated_analysis = dict(content.ai_analysis)
        updated_analysis.pop("source_fingerprint", None)
        content.ai_analysis = updated_analysis
        session.add(content)
    lesson.status = "queued"
    session.add(lesson)
    session.commit()
    upsert_job_status(session, lesson_id=video_id, status="queued", progress=0, error_message="")
    mode = enqueue_pipeline_job(
        video_id=video_id,
        video_path=str(video_path),
        output_language=_stored_output_language(content),
        fallback_task_adder=background_tasks.add_task,
    )
    return {
        "video_id": video_id,
        "status": "processing",
        "queue_mode": mode,
        "message": "Source-aware learning artifact regeneration has been queued.",
    }


@router.get("/{video_id}/summary")
async def get_summary(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    ai_analysis = _get_ai_analysis(video_id, session)
    if "summary" not in ai_analysis:
        return {"video_id": video_id, "message": "Tom tat chua san sang."}
    return {
        "video_id": video_id,
        "summary": ai_analysis["summary"],
        "status": ai_analysis.get("artifact_status", {}).get("summary"),
    }


@router.get("/{video_id}/highlights")
async def get_highlights(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    semantic_highlights = source_aware_highlights(
        list_lecture_events(session, video_id)
    )
    return {
        "video_id": video_id,
        "highlights": semantic_highlights,
        "source": "lecture_events",
    }


@router.get("/{video_id}/flashcards")
async def get_flashcards(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_video_access(video_id, current_user, session)
    statement = select(Flashcard).where(Flashcard.lesson_id == _parse_lesson_id(video_id))
    cards = session.exec(statement).all()
    return {
        "video_id": video_id,
        "flashcards": [
            {
                "id": str(card.id),
                "lesson_id": str(card.lesson_id),
                "front": _fix_mojibake_text(card.front),
                "back": _fix_mojibake_text(card.back),
                "hint": _fix_mojibake_text(card.hint) if card.hint else None,
                "source_segment_ids": card.source_segment_ids,
                "source_event_ids": card.source_event_ids,
                "created_at": card.created_at,
            }
            for card in cards
        ],
    }




@router.delete("/{video_id}")
async def delete_video(
    video_id: str,
    reason: str = Query(..., min_length=3, max_length=500),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    lesson = _ensure_lesson_owner_or_admin(video_id, current_user, session)
    lesson_uuid = lesson.id
    canonical_id = str(lesson_uuid)
    content = session.exec(select(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid)).first()

    flashcards = session.exec(select(Flashcard).where(Flashcard.lesson_id == lesson_uuid)).all()
    flashcard_ids = [flashcard.id for flashcard in flashcards]
    if flashcard_ids:
        session.exec(delete(UserFlashcardProgress).where(UserFlashcardProgress.flashcard_id.in_(flashcard_ids)))
    session.exec(delete(Flashcard).where(Flashcard.lesson_id == lesson_uuid))

    quizzes = session.exec(select(Quiz).where(Quiz.lesson_id == lesson_uuid)).all()
    quiz_ids = [quiz.id for quiz in quizzes]
    if quiz_ids:
        question_ids = [question.id for question in session.exec(select(Question).where(Question.quiz_id.in_(quiz_ids))).all()]
        if question_ids:
            session.exec(delete(QuestionOption).where(QuestionOption.question_id.in_(question_ids)))
        session.exec(delete(Question).where(Question.quiz_id.in_(quiz_ids)))
        session.exec(delete(QuizAttempt).where(QuizAttempt.quiz_id.in_(quiz_ids)))
        session.exec(delete(Quiz).where(Quiz.lesson_id == lesson_uuid))

    session.exec(delete(UserProgress).where(UserProgress.lesson_id == lesson_uuid))
    session.exec(delete(ProcessingJob).where(ProcessingJob.lesson_id == lesson_uuid))
    session.exec(delete(LectureReviewAudit).where(LectureReviewAudit.video_id == lesson_uuid))
    session.exec(delete(LectureEventRelation).where(LectureEventRelation.video_id == lesson_uuid))
    session.exec(delete(LectureEvent).where(LectureEvent.video_id == lesson_uuid))
    session.exec(delete(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid))
    _create_deletion_audit(
        session=session,
        entity_type="lesson",
        entity_id=str(lesson.id),
        entity_display_name=lesson.title,
        reason=reason,
        actor=current_user,
    )
    session.delete(lesson)
    session.commit()

    cleanup_failures = _cleanup_video_artifacts(canonical_id, content)
    if cleanup_failures:
        logger.warning(
            "Lesson artifact cleanup completed with %d local failure(s) for %s.",
            cleanup_failures,
            canonical_id,
        )
    return {
        "video_id": canonical_id,
        "deleted": True,
        "artifact_cleanup_complete": cleanup_failures == 0,
    }


@router.get("/{video_id}/thumbnail")
async def get_video_thumbnail(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Serve video thumbnail. Checks S3 uploads/thumbnails/ first, then falls back to local extraction.
    """
    check_video_access(video_id, current_user, session)
    from fastapi.responses import RedirectResponse
    for ext in (".jpg", ".jpeg", ".png"):
        s3_key = f"uploads/thumbnails/{video_id}{ext}"
        if s3_object_exists(s3_key):
            url = generate_presigned_url(s3_key, expires_in=7200)
            if url:
                return RedirectResponse(url=url, status_code=302)

        local_thumbnail = _THUMBNAILS_DIR / f"{video_id}{ext}"
        if _is_path_within(local_thumbnail, _THUMBNAILS_DIR) and local_thumbnail.is_file():
            return FileResponse(path=str(local_thumbnail))

    video_path = _find_existing_video_path(video_id, session)
    if not video_path:
        raise HTTPException(status_code=404, detail="Thumbnail not found.")

    try:
        thumbnail_path = VideoService.extract_thumbnail(video_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract video thumbnail: {e}")

    return FileResponse(path=str(thumbnail_path), media_type="image/jpeg")


@router.get("/{video_id}/stream")
async def stream_video(
    video_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Serve the video file directly. Falls back to S3 presigned URL when not cached locally.
    """
    from fastapi.responses import RedirectResponse
    check_video_access(video_id, current_user, session)
    video_path = _find_existing_video_path(video_id, session)
    if video_path:
        return FileResponse(path=str(video_path), media_type="video/mp4")

    content = _get_content_metadata(video_id, session)
    issued_key = _validated_video_s3_key(video_id, content.video_url if content else None)
    if issued_key and s3_object_exists(issued_key):
        url = generate_presigned_url(issued_key, expires_in=7200)
        if url:
            return RedirectResponse(url=url, status_code=302)

    for ext in (".mp4", ".mov", ".avi", ".mkv"):
        s3_key = f"uploads/videos/{video_id}{ext}"
        if s3_object_exists(s3_key):
            url = generate_presigned_url(s3_key, expires_in=7200)
            if url:
                return RedirectResponse(url=url, status_code=302)
    raise HTTPException(status_code=404, detail="Video file not found.")
