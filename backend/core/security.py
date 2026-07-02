from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .config import settings
from db import models, database

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# جعل الـ auto_error=False لكي نتمكن من التحقق من الكوكيز أولاً
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_PREFIX}/auth/login", auto_error=False)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# 🔴 التعديل الأمني الجذري: قراءة التوكن من الـ HttpOnly Cookie 🔴
def get_current_doctor(request: Request, db: Session = Depends(database.get_db), token_from_header: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="غير مصرح لك بالدخول، يرجى تسجيل الدخول أولاً",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # 1. محاولة جلب التوكن من الكوكيز (الآمنة)
    token = request.cookies.get("access_token")
    
    # 2. كبديل، محاولة جلبه من الهيدر (للـ Swagger UI)
    if not token:
        token = token_from_header
        
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    doctor = db.query(models.Doctor).filter(models.Doctor.email == email).first()
    if doctor is None:
        raise credentials_exception
    return doctor