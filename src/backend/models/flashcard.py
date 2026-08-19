from typing import Optional
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid
from src.backend.utils.datetime_utils import utc_now

class Flashcard(SQLModel, table=True):
    __tablename__ = "flashcards"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    lesson_id: uuid.UUID = Field(foreign_key="lessons.id")
    front: str = Field(nullable=False)
    back: str = Field(nullable=False)
    hint: Optional[str] = None
    source_segment_ids: list[int] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    source_event_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    created_at: datetime = Field(default_factory=utc_now)
    
    lesson: "Lesson" = Relationship(back_populates="flashcards")
    progress: Optional["UserFlashcardProgress"] = Relationship(back_populates="flashcard")

class UserFlashcardProgress(SQLModel, table=True):
    __tablename__ = "user_flashcard_progress"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    flashcard_id: uuid.UUID = Field(foreign_key="flashcards.id")
    box_level: int = Field(default=1) # Leitner system
    review_count: int = Field(default=0)
    correct_count: int = Field(default=0)
    incorrect_count: int = Field(default=0)
    status: str = Field(default="new") # new, learning, learned
    next_review_at: datetime = Field(default_factory=utc_now)
    last_reviewed_at: Optional[datetime] = None
    
    user: "User" = Relationship()
    flashcard: Flashcard = Relationship(back_populates="progress")
