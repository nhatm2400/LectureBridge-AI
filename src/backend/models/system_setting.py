from datetime import datetime
import uuid

from sqlmodel import Field, SQLModel

from src.backend.utils.datetime_utils import utc_now


class SystemSetting(SQLModel, table=True):
    __tablename__ = "system_settings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    key: str = Field(index=True, unique=True, nullable=False)
    value: str = Field(nullable=False)
    updated_at: datetime = Field(default_factory=utc_now)
