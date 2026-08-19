from datetime import datetime
import uuid

from sqlmodel import Field, SQLModel

from src.backend.utils.datetime_utils import utc_now


class CourseReview(SQLModel, table=True):
    __tablename__ = "course_reviews"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    rating: int = Field(default=5, ge=1, le=5)
    comment: str = Field(default="", max_length=2000)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

