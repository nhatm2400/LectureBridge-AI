from typing import Optional, List, TYPE_CHECKING
if TYPE_CHECKING:
    from .progress import Enrollment
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
import uuid
from ..utils.datetime_utils import utc_now

class Role(SQLModel, table=True):
    __tablename__ = "roles"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    description: Optional[str] = None
    
    users: List["User"] = Relationship(back_populates="role")

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    full_name: Optional[str] = None
    email: str = Field(unique=True, index=True, nullable=False)
    password_hash: str = Field(nullable=False)
    role_id: Optional[uuid.UUID] = Field(default=None, foreign_key="roles.id")
    is_deleted: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    
    role: Optional[Role] = Relationship(back_populates="users")
    profile: Optional["Profile"] = Relationship(back_populates="user")
    enrollments: List["Enrollment"] = Relationship(back_populates="user")

from sqlalchemy import Column, JSON

class Profile(SQLModel, table=True):
    __tablename__ = "profiles"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True)
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    learning_goals: Optional[str] = None
    certifications: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    
    user: User = Relationship(back_populates="profile")
