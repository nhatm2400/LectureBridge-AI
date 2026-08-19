from datetime import datetime
import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from src.backend.utils.datetime_utils import utc_now


class LectureEventRelation(SQLModel, table=True):
    __tablename__ = "lecture_event_relations"
    __table_args__ = (
        UniqueConstraint(
            "source_event_id",
            "target_event_id",
            "relation_type",
            name="uq_lecture_event_relation_pair_type",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    video_id: uuid.UUID = Field(foreign_key="lessons.id", index=True)
    source_event_id: uuid.UUID = Field(foreign_key="lecture_events.id", index=True)
    target_event_id: uuid.UUID = Field(foreign_key="lecture_events.id", index=True)
    relation_type: str = Field(default="QUESTION_ANSWER", max_length=32, index=True)
    confidence: float
    created_by: str = Field(default="AI", max_length=16)
    review_status: str = Field(default="UNREVIEWED", max_length=16)
    reviewed_by_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
