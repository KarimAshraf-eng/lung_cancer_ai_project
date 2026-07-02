from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from db import models, database
from core.security import get_current_doctor
from datetime import datetime, timedelta, timezone

router = APIRouter()

@router.get("/stats", summary="Get Clinical Doctor Dashboard")
def get_clinical_stats(
    current_doctor: models.Doctor = Depends(get_current_doctor),
    db: Session = Depends(database.get_db)
):
    doctor_id = current_doctor.id
    # حساب بداية اليوم لمعرفة أشعات اليوم
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Top Cards (المهام المطلوبة)
    processing_scans = db.query(models.Scan).filter(
        models.Scan.doctor_id == doctor_id, 
        models.Scan.status == "Processing"
    ).count()
    
    # الأشعات التي انتهى منها الذكاء الاصطناعي ولكن تحتوي على أورام لم يراجعها الطبيب (Pending)
    awaiting_review = db.query(models.Scan).join(models.Annotation).filter(
        models.Scan.doctor_id == doctor_id,
        models.Scan.status == "Completed",
        models.Annotation.status == "Pending"
    ).distinct().count()

    today_uploads = db.query(models.Scan).filter(
        models.Scan.doctor_id == doctor_id,
        models.Scan.created_at >= today_start
    ).count()

    # 2. Priority Worklist (أهم 5 حالات عاجلة تحتوي على أورام بنسبة ثقة عالية وتحتاج مراجعة)
    priority_query = db.query(models.Scan, models.Annotation)\
        .join(models.Annotation)\
        .filter(
            models.Scan.doctor_id == doctor_id, 
            models.Scan.status == "Completed", 
            models.Annotation.status == "Pending"
        )\
        .order_by(desc(models.Annotation.confidence))\
        .limit(10).all()

    # منع تكرار نفس الأشعة إذا كان بها أكثر من ورم
    seen_scans = set()
    priority_cases = []
    for scan, ann in priority_query:
        if scan.id not in seen_scans and len(priority_cases) < 5:
            seen_scans.add(scan.id)
            priority_cases.append({
                "scan_id": scan.id,
                "patient_name": scan.patient.name,
                "patient_tag": scan.patient.patient_id_tag,
                "max_confidence": round((ann.confidence or 0) * 100, 1),
                "date": scan.created_at.strftime("%b %d, %Y") if scan.created_at else "N/A"
            })

    # 3. Recent Activity (آخر 5 أشعات تم رفعها بشكل عام)
    recent_scans = db.query(models.Scan).filter(models.Scan.doctor_id == doctor_id)\
        .order_by(desc(models.Scan.created_at)).limit(5).all()
    
    activity_list = []
    for s in recent_scans:
        activity_list.append({
            "scan_id": s.id,
            "patient_name": s.patient.name,
            "status": s.status,
            "time_ago": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "N/A"
        })

    return {
        "doctor_name": current_doctor.name,
        "cards": {
            "processing": processing_scans,
            "awaiting_review": awaiting_review,
            "today_uploads": today_uploads
        },
        "priority_cases": priority_cases,
        "recent_activity": activity_list
    }


@router.get("/admin-stats", summary="Get System-wide Admin Stats")
def get_admin_stats(
    current_doctor: models.Doctor = Depends(get_current_doctor),
    db: Session = Depends(database.get_db)
):
    if not current_doctor.is_admin:
        raise HTTPException(status_code=403, detail="Unauthorized")

    total_doctors = db.query(models.Doctor).count()
    total_patients = db.query(models.Patient).count()
    total_scans = db.query(models.Scan).count()
    
    recent_logins = db.query(models.Doctor).filter(models.Doctor.last_login.isnot(None)).order_by(models.Doctor.last_login.desc()).limit(5).all()

    return {
        "total_doctors": total_doctors,
        "total_patients": total_patients,
        "total_scans": total_scans,
        "recent_logins": [
            {
                "name": d.name, 
                "email": d.email, 
                "last_login": d.last_login.strftime("%Y-%m-%dT%H:%M:%SZ") if d.last_login else None
            } for d in recent_logins
        ]
    }