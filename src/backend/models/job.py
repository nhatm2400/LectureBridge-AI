from typing import Optional, TYPE_CHECKING
if TYPE_CHECKING:
    from .course import Lesson
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid
from ..utils.datetime_utils import utc_now

class ProcessingJob(SQLModel, table=True):
    __tablename__ = "processing_jobs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    lesson_id: uuid.UUID = Field(foreign_key="lessons.id")
    job_type: str = Field(nullable=False)  # canonical transcript or lecture processing
    status: str = Field(default="pending") # pending, processing, completed, failed
    progress: int = Field(default=0)
    error_message: Optional[str] = None
    attempts: int = Field(default=0)
    last_failed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    
    lesson: "Lesson" = Relationship(back_populates="processing_jobs")
