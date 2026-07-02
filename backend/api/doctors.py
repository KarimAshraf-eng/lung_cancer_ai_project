from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db import models, database
from schemas import doctor as schemas
from core.security import get_password_hash, get_current_doctor

router = APIRouter()

# 🔴 1. جلب كل الأطباء (للمدير فقط)
@router.get("", summary="Admin: Get all doctors")
def get_all_doctors(db: Session = Depends(database.get_db), current_user: models.Doctor = Depends(get_current_doctor)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="صلاحية المدير مطلوبة.")
    
    doctors = db.query(models.Doctor).all()
    return [{"id": d.id, "name": d.name, "email": d.email, "is_active": d.is_active, "is_admin": d.is_admin, "created_at": d.created_at.strftime("%Y-%m-%d") if d.created_at else "N/A"} for d in doctors]

# 2. إضافة طبيب
@router.post("/add", response_model=schemas.DoctorResponse, summary="Admin: Add a new doctor")
def create_doctor(doctor: schemas.DoctorCreate, db: Session = Depends(database.get_db), current_user: models.Doctor = Depends(get_current_doctor)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="غير مسموح لك بإضافة أطباء.")

    db_doctor = db.query(models.Doctor).filter(models.Doctor.email == doctor.email).first()
    if db_doctor: raise HTTPException(status_code=400, detail="هذا البريد الإلكتروني مسجل بالفعل")
    
    new_doctor = models.Doctor(name=doctor.name, email=doctor.email, hashed_password=get_password_hash(doctor.password), is_admin=False)
    db.add(new_doctor)
    db.commit()
    db.refresh(new_doctor)
    return new_doctor

# 3. تحديث البروفايل الشخصي
@router.put("/update-profile", response_model=schemas.DoctorResponse, summary="Update current doctor profile")
def update_profile(profile_data: schemas.DoctorUpdate, db: Session = Depends(database.get_db), current_user: models.Doctor = Depends(get_current_doctor)):
    if profile_data.name: current_user.name = profile_data.name
    if profile_data.password: current_user.hashed_password = get_password_hash(profile_data.password)
    db.commit()
    db.refresh(current_user)
    return current_user

# 🔴 4. إيقاف / تفعيل حساب طبيب
@router.put("/{doctor_id}/toggle-status", summary="Admin: Toggle doctor active status")
def toggle_doctor_status(doctor_id: int, db: Session = Depends(database.get_db), current_user: models.Doctor = Depends(get_current_doctor)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Unauthorized")
    if current_user.id == doctor_id: raise HTTPException(status_code=400, detail="لا يمكنك إيقاف حسابك الشخصي.")
    
    target_doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not target_doctor: raise HTTPException(status_code=404, detail="Doctor not found")
    
    target_doctor.is_active = not target_doctor.is_active
    db.commit()
    return {"message": "Status updated", "is_active": target_doctor.is_active}

# 🔴 5. حذف طبيب
@router.delete("/{doctor_id}", summary="Admin: Delete doctor")
def delete_doctor(doctor_id: int, db: Session = Depends(database.get_db), current_user: models.Doctor = Depends(get_current_doctor)):
    if not current_user.is_admin: raise HTTPException(status_code=403, detail="Unauthorized")
    if current_user.id == doctor_id: raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الشخصي.")
    
    target_doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not target_doctor: raise HTTPException(status_code=404, detail="Doctor not found")
    
    db.delete(target_doctor)
    db.commit()
    return {"message": "Doctor deleted successfully"}