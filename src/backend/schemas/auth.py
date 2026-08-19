import re
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str
    full_name: Optional[str] = None
    role: str = "student"

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if not re.search(r"[A-Z]", value):
            raise ValueError("Password must include at least one uppercase letter.")
        if not re.search(r"[a-z]", value):
            raise ValueError("Password must include at least one lowercase letter.")
        if not re.search(r"\d", value):
            raise ValueError("Password must include at least one number.")
        return value

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: Optional[str]) -> str:
        role = (value or "student").strip().lower()
        if role not in {"student", "teacher", "admin"}:
            raise ValueError("Role must be student, teacher, or admin.")
        return role

    @model_validator(mode="after")
    def validate_password_confirmation(self):
        if self.password != self.confirm_password:
            raise ValueError("Password and confirm password do not match.")
        return self

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class LoginResult(BaseModel):
    role: str
