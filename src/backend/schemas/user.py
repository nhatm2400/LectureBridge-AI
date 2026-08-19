from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserRead(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    # Bạn có thể thêm trường password nếu muốn cho phép đổi mật khẩu tại đây
