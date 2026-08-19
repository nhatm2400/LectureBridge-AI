from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid
from src.backend.utils.datetime_utils import utc_now

class Enrollment(SQLModel, table=True):
    __tablename__ = "enrollments"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    enrollment_status: str = Field(default="active") # active, completed, cancelled
    started_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    
    user: "User" = Relationship(back_populates="enrollments")
    course: "Course" = Relationship(back_populates="enrollments")

class UserProgress(SQLModel, table=True):
    __tablename__ = "user_progress"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    lesson_id: uuid.UUID = Field(foreign_key="lessons.id")
    completion_status: str = Field(default="in_progress") # in_progress, completed
    progress_percent: int = Field(default=0)
    watched_seconds: int = Field(default=0)
    last_position_seconds: int = Field(default=0)
    duration_seconds: int = Field(default=0)
    last_accessed_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    
    user: "User" = Relationship()
    lesson: "Lesson" = Relationship(back_populates="progress")
