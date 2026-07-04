from fastapi import APIRouter, Depends, HTTPException, status, Response, BackgroundTasks, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime
from db import database, models
from core import security
from core.config import settings
from core.websocket_manager import manager
from schemas import doctor as doctor_schemas

router = APIRouter()


# ════════════════════════════════════════════════════════════════════
# 🔴 دالة مساعدة: تسجيل الأحداث في جدول LoginHistory
# ════════════════════════════════════════════════════════════════════
def _record_login_event(db: Session, doctor_id: int, event_type: str, ip_address: str = None):
    """
    سجّل حدث login أو logout في جدول LoginHistory.

    Args:
        db: جلسة قاعدة البيانات الحالية
        doctor_id: ID الطبيب
        event_type: "login" أو "logout"
        ip_address: عنوان IP اختياري للـ audit trail
    """
    try:
        new_event = models.LoginHistory(
            doctor_id=doctor_id,
            event_type=event_type,
            ip_address=ip_address,
        )
        db.add(new_event)
        db.commit()
    except Exception as e:
        # لو فيه أي خطأ في تسجيل الحدث، ممنعيش الـ request كله يقع
        print(f"⚠️ Failed to record {event_type} event for doctor {doctor_id}: {e}")
        db.rollback()


@router.post("/login", summary="Doctor Login")
def login(
    response: Response,
    background_tasks: BackgroundTasks,
    request: Request,  # 🔴 عشان نقدر نجيب IP
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

    # 🔴 تسجيل الوقت كـ UTC صريح
    user.last_login = datetime.utcnow()
    db.commit()

    # 🔴🔴 تسجيل حدث الـ login في جدول LoginHistory
    client_ip = None
    try:
        client_ip = request.client.host if request.client else None
    except Exception:
        client_ip = None
    _record_login_event(db, doctor_id=user.id, event_type="login", ip_address=client_ip)

    # 🔴 إرسال إشعار فوري (Real-time) للمديرين المتصلين عبر الـ WebSockets
    login_time_iso = user.last_login.strftime("%Y-%m-%dT%H:%M:%SZ")

    async def notify_admins():
        await manager.broadcast({
            "type": "NEW_LOGIN",
            "data": {
                "name": user.name,
                "email": user.email,
                "last_login": login_time_iso,
                "event": "login"   # 🔴 أضفنا نوع الحدث عشان الـ admin يقدر يفرّق
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
def logout(
    response: Response,
    request: Request,  # 🔴 عشان نقدر نجيب IP
    current_doctor: models.Doctor = Depends(security.get_current_doctor),
    db: Session = Depends(database.get_db)
):
    """
    🔴🔴 التعديل: تسجيل حدث logout في جدول LoginHistory
    قبل التعديل: كان مجرد حذف للكوكيز بدون أي record.
    بعد التعديل: بنضيف row في LoginHistory بنوع "logout" عشان الـ admin
                  يقدر يشوف مين سجل خروج ومتى.
    """
    # 🔴 سجّل حدث الـ logout لو المستخدم مسجّل دخول فعلاً
    if current_doctor:
        client_ip = None
        try:
            client_ip = request.client.host if request.client else None
        except Exception:
            client_ip = None
        _record_login_event(db, doctor_id=current_doctor.id, event_type="logout", ip_address=client_ip)

        # 🔴 إشعار real-time للمديرين بإن حد سجل خروج
        logout_time_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        async def notify_admins_logout():
            await manager.broadcast({
                "type": "DOCTOR_LOGOUT",
                "data": {
                    "name": current_doctor.name,
                    "email": current_doctor.email,
                    "timestamp": logout_time_iso,
                    "event": "logout"
                }
            })

        # بنفّذها sync لأن الـ response هيتتمسح بسرعة
        import asyncio
        try:
            asyncio.get_event_loop().run_until_complete(notify_admins_logout())
        except RuntimeError:
            # fallback لو مفيش event loop
            pass

    response.delete_cookie("access_token", httponly=True, samesite="lax")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=doctor_schemas.DoctorResponse, summary="Get Current Logged-in Doctor Info")
def get_me(current_doctor: models.Doctor = Depends(security.get_current_doctor)):
    return current_doctor