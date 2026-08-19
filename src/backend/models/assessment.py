from typing import Optional, List, TYPE_CHECKING
if TYPE_CHECKING:
    from .course import Lesson
    from .user import User
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid
from decimal import Decimal
from ..utils.datetime_utils import utc_now

class Quiz(SQLModel, table=True):
    __tablename__ = "quizzes"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    lesson_id: uuid.UUID = Field(foreign_key="lessons.id")
    title: str = Field(nullable=False)
    passing_score: int = Field(default=80)
    time_limit_minutes: Optional[int] = None
    created_at: datetime = Field(default_factory=utc_now)
    
    lesson: "Lesson" = Relationship(back_populates="quizzes")
    questions: List["Question"] = Relationship(back_populates="quiz")
    attempts: List["QuizAttempt"] = Relationship(back_populates="quiz")

from sqlalchemy import Column, JSON

class Question(SQLModel, table=True):
    __tablename__ = "questions"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quiz_id: uuid.UUID = Field(foreign_key="quizzes.id")
    question_text: str = Field(nullable=False)
    explanation: Optional[str] = None
    difficulty: str = Field(default="Trung bình")
    question_type: str = Field(default="multiple_choice")
    question_data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    source_segment_ids: list[int] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    source_event_ids: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    score: int = Field(default=1)
    sort_order: int = Field(default=0)
    
    quiz: Quiz = Relationship(back_populates="questions")
    options: List["QuestionOption"] = Relationship(back_populates="question")

class QuestionOption(SQLModel, table=True):
    __tablename__ = "question_options"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    question_id: uuid.UUID = Field(foreign_key="questions.id")
    option_text: str = Field(nullable=False)
    is_correct: bool = Field(default=False)
    
    question: Question = Relationship(back_populates="options")

class QuizAttempt(SQLModel, table=True):
    __tablename__ = "quiz_attempts"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    quiz_id: uuid.UUID = Field(foreign_key="quizzes.id")
    user_id: uuid.UUID = Field(foreign_key="users.id")
    score: Decimal = Field(default=0.0)
    status: str = Field(default="failed") # passed, failed
    answers_json: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
    
    quiz: Quiz = Relationship(back_populates="attempts")
    user: "User" = Relationship()
