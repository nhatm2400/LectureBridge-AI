from datetime import datetime
import uuid

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from src.backend.utils.datetime_utils import utc_now


class LectureReviewAudit(SQLModel, table=True):
    __tablename__ = "lecture_review_audits"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    video_id: uuid.UUID = Field(foreign_key="lessons.id", index=True)
    entity_type: str = Field(max_length=16)
    entity_id: uuid.UUID = Field(index=True)
    action: str = Field(max_length=16)
    actor_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    before_state: dict | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
    )
    after_state: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    created_at: datetime = Field(default_factory=utc_now)
