from datetime import datetime
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from src.backend.utils.datetime_utils import utc_now


class LectureEvent(SQLModel, table=True):
    __tablename__ = "lecture_events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    video_id: uuid.UUID = Field(foreign_key="lessons.id", index=True)
    event_type: str = Field(max_length=32, index=True)
    start_time: float = Field(index=True)
    end_time: float
    title: str = Field(max_length=500)
    description: str = ""
    confidence: float
    inference_type: str = Field(max_length=16)
    source_segment_ids: list[int] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    created_by: str = Field(default="AI", max_length=16)
    review_status: str = Field(default="UNREVIEWED", max_length=16)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
