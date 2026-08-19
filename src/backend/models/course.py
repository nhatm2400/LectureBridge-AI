from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid
from decimal import Decimal
from src.backend.utils.datetime_utils import utc_now

class Category(SQLModel, table=True):
    __tablename__ = "categories"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    parent_id: Optional[uuid.UUID] = Field(default=None, foreign_key="categories.id")
    name: str = Field(nullable=False)
    description: Optional[str] = None
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    
    courses: List["Course"] = Relationship(back_populates="category")

class Course(SQLModel, table=True):
    __tablename__ = "courses"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    category_id: Optional[uuid.UUID] = Field(default=None, foreign_key="categories.id")
    instructor_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    title: str = Field(nullable=False)
    description: Optional[str] = None
    price: Decimal = Field(default=0.0)
    thumbnail_url: Optional[str] = None
    level: Optional[str] = None # Beginner, Intermediate, Advanced
    language: str = Field(default="vi")
    is_published: bool = Field(default=False)
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    
    category: Optional[Category] = Relationship(back_populates="courses")
    modules: List["Module"] = Relationship(back_populates="course")
    enrollments: List["Enrollment"] = Relationship(back_populates="course")

class Module(SQLModel, table=True):
    __tablename__ = "modules"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    title: str = Field(nullable=False)
    description: Optional[str] = None
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=utc_now)
    
    course: Course = Relationship(back_populates="modules")
    lessons: List["Lesson"] = Relationship(back_populates="module")

class Lesson(SQLModel, table=True):
    __tablename__ = "lessons"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    module_id: uuid.UUID = Field(foreign_key="modules.id")
    title: str = Field(nullable=False)
    content_type: str = Field(default="video") # video, article, quiz
    status: str = Field(default="queued")
    duration_minutes: int = Field(default=0)
    is_preview: bool = Field(default=False)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=utc_now)
    
    module: Module = Relationship(back_populates="lessons")
    content: Optional["ContentMetadata"] = Relationship(back_populates="lesson")
    progress: List["UserProgress"] = Relationship(back_populates="lesson")
    quizzes: List["Quiz"] = Relationship(back_populates="lesson")
    flashcards: List["Flashcard"] = Relationship(back_populates="lesson")
    processing_jobs: List["ProcessingJob"] = Relationship(back_populates="lesson")
