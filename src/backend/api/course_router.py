from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List
import uuid
from src.backend.database import get_session
from src.backend.auth import get_current_user
from src.backend.models import Category, Course, Module, Lesson, User, Enrollment
from src.backend.utils.datetime_utils import utc_now

router = APIRouter(prefix="/api/courses", tags=["courses"])


class ModuleUpdatePayload(BaseModel):
    title: str
    description: str | None = None
    sort_order: int | None = None


def _role_name(user: User) -> str:
    return (user.role.name if user.role else "student").lower()


def _require_teacher_or_admin(user: User) -> None:
    if _role_name(user) not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Only teacher/admin can perform this action.")


def _ensure_course_owner_or_admin(course_id: uuid.UUID, user: User, session: Session) -> Course:
    course = session.get(Course, course_id)
    if not course or course.is_deleted:
        raise HTTPException(status_code=404, detail="Course not found")
    if _role_name(user) == "admin" or course.instructor_id == user.id:
        return course
    raise HTTPException(status_code=403, detail="Access denied.")


def _can_view_course(course: Course, user: User, session: Session) -> bool:
    role = _role_name(user)
    if role == "admin":
        return True
    if course.instructor_id == user.id:
        return True
    enrollment = session.exec(
        select(Enrollment).where(
            Enrollment.user_id == user.id,
            Enrollment.course_id == course.id,
        )
    ).first()
    return enrollment is not None


def _ensure_course_view_access(course_id: uuid.UUID, user: User, session: Session) -> Course:
    course = session.get(Course, course_id)
    if not course or course.is_deleted:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.is_published and _role_name(user) in {"student", "teacher", "admin"}:
        return course
    if _can_view_course(course, user, session):
        return course
    raise HTTPException(status_code=403, detail="Access denied.")


def _ensure_module_view_access(module_id: uuid.UUID, user: User, session: Session) -> Module:
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    _ensure_course_view_access(module.course_id, user, session)
    return module


def _ensure_lesson_view_access(lesson_id: uuid.UUID, user: User, session: Session) -> Lesson:
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    module = session.get(Module, lesson.module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    _ensure_course_view_access(module.course_id, user, session)
    return lesson


def _resolve_next_module_sort_order(course_id: uuid.UUID, session: Session) -> int:
    modules = session.exec(select(Module).where(Module.course_id == course_id)).all()
    if not modules:
        return 1
    return max((module.sort_order or 0) for module in modules) + 1

# --- Categories ---
@router.get("/categories", response_model=List[Category])
async def list_categories(session: Session = Depends(get_session)):
    return session.exec(select(Category)).all()

@router.post("/categories", response_model=Category)
async def create_category(category: Category, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    if _role_name(current_user) != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create categories.")
    session.add(category)
    session.commit()
    session.refresh(category)
    return category

# --- Courses ---
@router.get("/", response_model=List[Course])
async def list_courses(category_id: uuid.UUID = None, session: Session = Depends(get_session)):
    statement = select(Course).where(Course.is_published == True, Course.is_deleted == False)  # noqa: E712
    if category_id:
        statement = statement.where(Course.category_id == category_id)
    return session.exec(statement).all()

@router.get("/{course_id}", response_model=Course)
async def get_course(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _ensure_course_view_access(course_id, current_user, session)

@router.post("/", response_model=Course)
async def create_course(course: Course, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _require_teacher_or_admin(current_user)
    course.instructor_id = current_user.id
    session.add(course)
    session.commit()
    session.refresh(course)
    return course

# --- Modules ---
@router.get("/{course_id}/modules", response_model=List[Module])
async def list_modules(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _ensure_course_view_access(course_id, current_user, session)
    return session.exec(select(Module).where(Module.course_id == course_id).order_by(Module.sort_order)).all()

@router.post("/{course_id}/modules", response_model=Module)
async def create_module(
    course_id: uuid.UUID,
    module: Module,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _ensure_course_owner_or_admin(course_id, current_user, session)
    module.course_id = course_id
    if module.sort_order is None or module.sort_order <= 0:
        module.sort_order = _resolve_next_module_sort_order(course_id, session)
    if module.sort_order > 2_147_483_647:
        raise HTTPException(status_code=422, detail="sort_order exceeds max INTEGER range.")
    session.add(module)
    session.commit()
    session.refresh(module)
    return module


@router.patch("/modules/{module_id}", response_model=Module)
async def update_module(
    module_id: uuid.UUID,
    payload: ModuleUpdatePayload,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    _ensure_course_owner_or_admin(module.course_id, current_user, session)

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Module title is required.")

    module.title = title
    if payload.description is not None:
        module.description = payload.description.strip() or None
    if payload.sort_order is not None:
        if payload.sort_order < 0 or payload.sort_order > 2_147_483_647:
            raise HTTPException(status_code=422, detail="sort_order out of range.")
        module.sort_order = payload.sort_order

    session.add(module)
    session.commit()
    session.refresh(module)
    return module

# --- Lessons ---
@router.get("/modules/{module_id}/lessons", response_model=List[Lesson])
async def list_lessons(
    module_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _ensure_module_view_access(module_id, current_user, session)
    lessons = session.exec(select(Lesson).where(Lesson.module_id == module_id).order_by(Lesson.sort_order)).all()
    import re
    def natural_sort_key(title):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', title or '')]
    return sorted(lessons, key=lambda l: (l.sort_order or 0, natural_sort_key(l.title)))

@router.get("/lessons/{lesson_id}", response_model=Lesson)
async def get_lesson(
    lesson_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return _ensure_lesson_view_access(lesson_id, current_user, session)
