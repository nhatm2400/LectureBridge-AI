from typing import Optional
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid
from src.backend.utils.datetime_utils import utc_now

from sqlalchemy import Column, JSON

class ContentMetadata(SQLModel, table=True):
    __tablename__ = "content_metadata"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    lesson_id: uuid.UUID = Field(foreign_key="lessons.id", unique=True)
    video_url: Optional[str] = None
    article_content: Optional[str] = None
    attachment_url: Optional[str] = None
    ai_analysis: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
    
    lesson: "Lesson" = Relationship(back_populates="content")
