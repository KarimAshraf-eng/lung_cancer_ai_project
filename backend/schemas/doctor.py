from pydantic import BaseModel, EmailStr
from typing import Optional

# البيانات المطلوبة لإنشاء حساب طبيب
class DoctorCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

# 👇 المودل الجديد الخاص بتحديث البروفايل 👇
class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None

# البيانات التي سيرد بها الـ API بعد إنشاء الحساب
class DoctorResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    is_active: bool
    is_admin: bool

    class Config:
        from_attributes = True