from datetime import datetime
import uuid

from sqlmodel import Field, SQLModel

from src.backend.utils.datetime_utils import utc_now


class DeletionAudit(SQLModel, table=True):
    __tablename__ = "deletion_audits"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    entity_type: str = Field(nullable=False, index=True)  # user, course, lesson
    entity_id: str = Field(nullable=False, index=True)
    entity_display_name: str | None = None
    deleted_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    deleted_by_email: str | None = None
    reason: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=utc_now, index=True)

