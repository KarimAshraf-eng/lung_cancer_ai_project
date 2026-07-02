from db.database import SessionLocal, engine
from db import models
from db.models import Doctor
from core.security import get_password_hash

def create_super_admin():
    # 🔴 السطر ده هيحل المشكلة: بيبني الجداول في الداتابيز لو مش موجودة
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # التأكد إن الحساب مش موجود أصلاً
    admin_email = "admin@hospital.com"
    existing_admin = db.query(Doctor).filter(Doctor.email == admin_email).first()
    
    if existing_admin:
        print("⚠️ حساب المدير موجود بالفعل!")
    else:
        # إنشاء حساب المدير السري
        new_admin = Doctor(
            name="System Admin",
            email=admin_email,
            hashed_password=get_password_hash("admin1234"), # الباسورد المبدئي
            is_active=True,
            is_admin=True # 🔴 أهم سطر: ده اللي بيديله الصلاحيات
        )
        db.add(new_admin)
        db.commit()
        print("✅ تم إنشاء حساب المدير بنجاح!")
        print(f"البريد: {admin_email}")
        print("كلمة المرور: admin1234")
        
    db.close()

if __name__ == "__main__":
    create_super_admin()