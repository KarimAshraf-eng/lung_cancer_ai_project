from fastapi import APIRouter, Depends, HTTPException, status, Response, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
from db import database, models
from core import security
from core.config import settings
from core.websocket_manager import manager
from schemas import doctor as doctor_schemas

router = APIRouter()

@router.post("/login", summary="Doctor Login")
def login(
    response: Response, 
    background_tasks: BackgroundTasks, # 🔴 استخدام الـ BackgroundTasks
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(database.get_db)
):
    user = db.query(models.Doctor).filter(models.Doctor.email == form_data.username).first()
    
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="الإيميل أو كلمة المرور غير صحيحة",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="تم إيقاف هذا الحساب من قبل الإدارة.",
        )
    
    # 🔴 تسجيل الوقت كـ UTC صريح 🔴
    user.last_login = datetime.utcnow()
    db.commit()
    
    # 🔴 إرسال إشعار فوري (Real-time) للمديرين المتصلين عبر الـ WebSockets 🔴
    login_time_iso = user.last_login.strftime("%Y-%m-%dT%H:%M:%SZ")
    
    async def notify_admins():
        await manager.broadcast({
            "type": "NEW_LOGIN",
            "data": {
                "name": user.name,
                "email": user.email,
                "last_login": login_time_iso
            }
        })
        
    background_tasks.add_task(notify_admins)
    
    access_token = security.create_access_token(data={"sub": user.email})
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,  
        secure=False,   
        samesite="lax", 
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    
    return {"message": "Login successful"}

@router.post("/logout", summary="Doctor Logout")
def logout(response: Response):
    response.delete_cookie("access_token", httponly=True, samesite="lax")
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=doctor_schemas.DoctorResponse, summary="Get Current Logged-in Doctor Info")
def get_me(current_doctor: models.Doctor = Depends(security.get_current_doctor)):
    return current_doctor