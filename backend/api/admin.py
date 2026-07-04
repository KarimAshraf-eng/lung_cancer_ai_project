"""
Admin Panel API
Complete system administration endpoints for managing doctors,
monitoring patients, and accessing clinical data across the system.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
import os
import shutil

from db import models, database
from schemas import doctor as doctor_schemas
from core.security import get_password_hash, get_current_doctor


router = APIRouter()


# ── Dependency: Require Admin Access ──────────────────────────────

def require_admin(
    current_user: models.Doctor = Depends(get_current_doctor),
) -> models.Doctor:
    """Ensures the requesting user has admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


# ── Helper: Calculate date range from period string ───────────────

def _get_period_range(period: str):
    """Returns (start_datetime, end_datetime) for the given period keyword."""
    now = datetime.utcnow()

    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now

    elif period == "yesterday":
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, end

    elif period == "this_week":
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now

    elif period == "this_month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, now

    elif period == "this_year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, now

    elif period == "all":
        return datetime.min, now

    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now


# ── Helper: Compute display_status for a scan ────────────────

def _compute_display_status(scan):
    """Returns 'Unreviewed' if scan is Completed but has Pending annotations, else returns scan.status."""
    if scan.status == "Completed":
        pending_annotations = [a for a in scan.annotations if a.status == "Pending"]
        if pending_annotations:
            return "Unreviewed"
    return scan.status


# ── Helper: Determine if a doctor is currently online ─────────────
def _is_doctor_online(doctor) -> bool:
    """
    طبيب "online" لو:
      - is_active = True
      - last_login = خلال آخر 30 دقيقة
      - آخر حدث في LoginHistory = "login" (مش "logout")
    """
    if not doctor.is_active or not doctor.last_login:
        return False
    thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)
    if doctor.last_login < thirty_min_ago:
        return False
    # تحقق إن آخر حدث login (مش logout)
    last_event = (
        db_session_for_helper.query(models.LoginHistory)
        .filter(models.LoginHistory.doctor_id == doctor.id)
        .order_by(desc(models.LoginHistory.timestamp))
        .first()
    ) if False else None  # placeholder — ده بيتعمل بشكل صحيح في الـ endpoints
    return True


# ════════════════════════════════════════════════════════════════════
# 1. SYSTEM OVERVIEW
# ════════════════════════════════════════════════════════════════════

@router.get("/overview", summary="Admin: System-wide overview statistics")
def get_admin_overview(
    period: str = Query("today", description="today, yesterday, this_week, this_month, this_year, all"),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns total doctors, patients, scans, and period-filtered scan counts."""

    total_doctors = db.query(models.Doctor).filter(models.Doctor.is_admin == False).count()
    total_patients = db.query(models.Patient).count()
    total_scans = db.query(models.Scan).count()

    # Scans status breakdown
    processing_count = db.query(models.Scan).filter(models.Scan.status == "Processing").count()
    completed_scans = db.query(models.Scan).filter(models.Scan.status == "Completed").all()
    completed_count = len(completed_scans)
    failed_count = db.query(models.Scan).filter(models.Scan.status == "Failed").count()

    # Split completed into reviewed and unreviewed
    unreviewed_count = 0
    reviewed_count = 0
    for s in completed_scans:
        has_pending = any(a.status == "Pending" for a in s.annotations)
        if has_pending:
            unreviewed_count += 1
        else:
            reviewed_count += 1

    # Period-based counts
    start, end = _get_period_range(period)

    scans_in_period = (
        db.query(models.Scan)
        .filter(and_(models.Scan.created_at >= start, models.Scan.created_at < end))
        .all()
    )

    scanned_patient_ids = set(s.patient_id for s in scans_in_period)
    scanned_patients_in_period = len(scanned_patient_ids)
    scanned_count_in_period = len(scans_in_period)

    # Active doctors (logged in within last 30 minutes)
    thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)
    active_doctors = (
        db.query(models.Doctor)
        .filter(
            models.Doctor.is_admin == False,
            models.Doctor.is_active == True,
            models.Doctor.last_login.isnot(None),
            models.Doctor.last_login >= thirty_min_ago,
        )
        .count()
    )

    return {
        "total_doctors": total_doctors,
        "active_doctors": active_doctors,
        "total_patients": total_patients,
        "total_scans": total_scans,
        "processing_count": processing_count,
        "completed_count": completed_count,
        "reviewed_count": reviewed_count,
        "unreviewed_count": unreviewed_count,
        "failed_count": failed_count,
        "period": period,
        "scanned_patients_in_period": scanned_patients_in_period,
        "scanned_count_in_period": scanned_count_in_period,
    }


# ════════════════════════════════════════════════════════════════════
# 2. RECENT LOGINS  (🔴 معاد لـ "Live Doctor Activity")
# ════════════════════════════════════════════════════════════════════
# التعديل: بدل ما يعرض بس "آخر حدث login لكل دكتور"، بقى يعرض آخر 15 حدث
# (login + logout) لكل الدكاترة + حالة online/offline اللحظية + آخر IP.
# ════════════════════════════════════════════════════════════════════

@router.get("/recent-logins", summary="Admin: Get live doctor activity (login/logout events)")
def get_recent_logins(
    limit: int = Query(15, ge=1, le=100),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    🔴🔴 التعديل: بقى "Live Doctor Activity"
    بيرجّع آخر 15 حدث (login + logout) لكل الدكاترة، مع:
      - اسم الدكتور وإيميله
      - نوع الحدث (login أو logout)
      - timestamp
      - IP address (لو متوفر)
      - حالة online/offline الحالية للدكتور

    الـ admin بياخد الـ response ده ويعرضه في "Live Doctor Activity" في الـ Overview.
    """
    # آخر `limit` حدث في جدول LoginHistory
    recent_events = (
        db.query(models.LoginHistory)
        .join(models.Doctor)
        .filter(models.Doctor.is_admin == False)
        .order_by(desc(models.LoginHistory.timestamp))
        .limit(limit)
        .all()
    )

    thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)

    result = []
    for evt in recent_events:
        doctor = evt.doctor
        # online = is_active + last_login خلال 30 دقيقة + آخر حدث = login
        last_event = recent_events[0] if recent_events else None
        is_online = (
            doctor.is_active
            and doctor.last_login is not None
            and doctor.last_login >= thirty_min_ago
            # تحقق إن آخر حدث للدكتور ده = login (مش logout)
            and evt.event_type == "login"
        )

        result.append({
            "id": evt.id,
            "doctor_id": doctor.id,
            "name": doctor.name,
            "email": doctor.email,
            "is_active": doctor.is_active,
            "event_type": evt.event_type,        # "login" أو "logout"
            "timestamp": evt.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ") if evt.timestamp else None,
            "ip_address": evt.ip_address,
            # حالة الـ online "الحالية" (بترجع لـ last_event من نوع login)
            "is_online": _compute_online_status(db, doctor.id, thirty_min_ago),
        })

    return result


def _compute_online_status(db: Session, doctor_id: int, thirty_min_ago: datetime) -> bool:
    """
    حدد هل الدكتور ده online دلوقتي ولا لأ:
      - is_active = True
      - آخر حدث في LoginHistory = "login" (مش "logout")
      - الـ timestamp بتاع آخر حدث login خلال آخر 30 دقيقة
    """
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor or not doctor.is_active:
        return False

    # هات آخر حدث login للدكتور ده
    last_login_event = (
        db.query(models.LoginHistory)
        .filter(
            models.LoginHistory.doctor_id == doctor_id,
            models.LoginHistory.event_type == "login",
        )
        .order_by(desc(models.LoginHistory.timestamp))
        .first()
    )
    if not last_login_event:
        return False

    # هات آخر حدث logout للدكتور ده
    last_logout_event = (
        db.query(models.LoginHistory)
        .filter(
            models.LoginHistory.doctor_id == doctor_id,
            models.LoginHistory.event_type == "logout",
        )
        .order_by(desc(models.LoginHistory.timestamp))
        .first()
    )

    # لو فيه logout بعد آخر login → الدكتور ده offline
    if last_logout_event and last_logout_event.timestamp > last_login_event.timestamp:
        return False

    # تحقق إن آخر login خلال 30 دقيقة
    if last_login_event.timestamp < thirty_min_ago:
        return False

    return True


# ════════════════════════════════════════════════════════════════════
# 🔴🔴 جديد: DOCTOR ACTIVITY  (صفحة Doctor Activity الجديدة)
# ════════════════════════════════════════════════════════════════════

@router.get("/doctor-activity", summary="Admin: List all doctors with current online/offline status")
def get_doctor_activity(
    search: Optional[str] = Query(None, description="Search by name or email"),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    🔴🔴 endpoint جديد للصفحة الجديدة "Doctor Activity"
    بيرجّع كل الدكاترة مع:
      - بياناتهم (id, name, email, is_active, created_at)
      - حالة online/offline الحالية
      - آخر مرة سجّلوا فيها login (من last_login column)
      - عدد مرات الـ login الكلية
      - عدد مرات الـ logout الكلية
    """
    query = db.query(models.Doctor).filter(models.Doctor.is_admin == False)

    if search:
        query = query.filter(
            or_(
                models.Doctor.name.ilike(f"%{search}%"),
                models.Doctor.email.ilike(f"%{search}%"),
            )
        )

    doctors = query.order_by(desc(models.Doctor.created_at)).all()
    thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)

    result = []
    for d in doctors:
        # عدد مرات login
        login_count = (
            db.query(models.LoginHistory)
            .filter(
                models.LoginHistory.doctor_id == d.id,
                models.LoginHistory.event_type == "login",
            )
            .count()
        )
        # عدد مرات logout
        logout_count = (
            db.query(models.LoginHistory)
            .filter(
                models.LoginHistory.doctor_id == d.id,
                models.LoginHistory.event_type == "logout",
            )
            .count()
        )
        # آخر حدث (سواء login أو logout)
        last_event = (
            db.query(models.LoginHistory)
            .filter(models.LoginHistory.doctor_id == d.id)
            .order_by(desc(models.LoginHistory.timestamp))
            .first()
        )
        last_event_type = last_event.event_type if last_event else None
        last_event_time = last_event.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ") if last_event and last_event.timestamp else None

        # online status
        is_online = _compute_online_status(db, d.id, thirty_min_ago)

        result.append({
            "id": d.id,
            "name": d.name,
            "email": d.email,
            "is_active": d.is_active,
            "is_online": is_online,
            "last_login": d.last_login.strftime("%Y-%m-%dT%H:%M:%SZ") if d.last_login else None,
            "last_event_type": last_event_type,         # "login" أو "logout" أو null
            "last_event_time": last_event_time,
            "login_count": login_count,
            "logout_count": logout_count,
            "created_at": d.created_at.strftime("%Y-%m-%d") if d.created_at else "N/A",
        })

    return result


@router.get("/doctors/{doctor_id}/login-history", summary="Admin: Get full login/logout history for a doctor")
def get_doctor_login_history(
    doctor_id: int,
    limit: int = Query(100, ge=1, le=500),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """
    🔴🔴 endpoint جديد: سجل login/logout كامل لدكتور معين
    بيرجّع آخر 100 حدث مرتبين من الأحدث للأقدم.
    """
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    events = (
        db.query(models.LoginHistory)
        .filter(models.LoginHistory.doctor_id == doctor_id)
        .order_by(desc(models.LoginHistory.timestamp))
        .limit(limit)
        .all()
    )

    # إحصائيات سريعة
    total_logins = sum(1 for e in events if e.event_type == "login")
    total_logouts = sum(1 for e in events if e.event_type == "logout")
    thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)
    is_online = _compute_online_status(db, doctor_id, thirty_min_ago)

    return {
        "doctor_info": {
            "id": doctor.id,
            "name": doctor.name,
            "email": doctor.email,
            "is_active": doctor.is_active,
            "is_online": is_online,
            "last_login": doctor.last_login.strftime("%Y-%m-%dT%H:%M:%SZ") if doctor.last_login else None,
            "created_at": doctor.created_at.strftime("%Y-%m-%d") if doctor.created_at else "N/A",
        },
        "stats": {
            "total_logins": total_logins,
            "total_logouts": total_logouts,
            "events_returned": len(events),
        },
        "history": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "timestamp": e.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ") if e.timestamp else None,
                "ip_address": e.ip_address,
            }
            for e in events
        ],
    }


# ════════════════════════════════════════════════════════════════════
# 3. RECENT SYSTEM ACTIVITY (Latest scans across all doctors)
# ════════════════════════════════════════════════════════════════════

@router.get("/recent-activity", summary="Admin: Latest scans across the system")
def get_recent_activity(
    limit: int = Query(10, ge=1, le=50),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns the most recent scans across all doctors with patient info."""
    scans = (
        db.query(models.Scan)
        .order_by(desc(models.Scan.created_at))
        .limit(limit)
        .all()
    )

    activity = []
    for s in scans:
        doctor = db.query(models.Doctor).filter(models.Doctor.id == s.doctor_id).first()
        activity.append({
            "scan_id": s.id,
            "patient_name": s.patient.name if s.patient else "Unknown",
            "patient_tag": s.patient.patient_id_tag if s.patient else "N/A",
            "doctor_name": doctor.name if doctor else "Unknown",
            "doctor_id": s.doctor_id,
            "status": s.status,
            "display_status": _compute_display_status(s),
            "created_at": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "Unknown",
        })

    return activity


# ════════════════════════════════════════════════════════════════════
# 4. DOCTOR MANAGEMENT
# ════════════════════════════════════════════════════════════════════

@router.get("/doctors", summary="Admin: List all doctors with stats")
def get_all_doctors(
    search: Optional[str] = Query(None, description="Search by name or email"),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns all non-admin doctors with their scan/patient counts and status."""
    query = db.query(models.Doctor).filter(models.Doctor.is_admin == False)

    if search:
        query = query.filter(
            or_(
                models.Doctor.name.ilike(f"%{search}%"),
                models.Doctor.email.ilike(f"%{search}%"),
            )
        )

    doctors = query.order_by(desc(models.Doctor.created_at)).all()
    thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)

    result = []
    for d in doctors:
        scan_count = db.query(models.Scan).filter(models.Scan.doctor_id == d.id).count()
        patient_count = (
            db.query(func.count(func.distinct(models.Scan.patient_id)))
            .filter(models.Scan.doctor_id == d.id)
            .scalar() or 0
        )
        is_online = bool(
            d.is_active
            and d.last_login
            and d.last_login >= thirty_min_ago
        )

        result.append({
            "id": d.id,
            "name": d.name,
            "email": d.email,
            "is_active": d.is_active,
            "is_online": is_online,
            "scan_count": scan_count,
            "patient_count": patient_count,
            "created_at": d.created_at.strftime("%Y-%m-%d") if d.created_at else "N/A",
            "last_login": d.last_login.strftime("%Y-%m-%dT%H:%M:%SZ") if d.last_login else None,
        })

    return result


@router.post("/doctors", summary="Admin: Register a new doctor")
def add_doctor(
    doctor_data: doctor_schemas.DoctorCreate,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Creates a new doctor account."""
    existing = db.query(models.Doctor).filter(models.Doctor.email == doctor_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="This email is already registered.")

    new_doctor = models.Doctor(
        name=doctor_data.name,
        email=doctor_data.email,
        hashed_password=get_password_hash(doctor_data.password),
        is_admin=False,
    )
    db.add(new_doctor)
    db.commit()
    db.refresh(new_doctor)

    return {"message": "Doctor added successfully", "id": new_doctor.id, "name": new_doctor.name}


@router.put("/doctors/{doctor_id}/toggle-status", summary="Admin: Activate or deactivate a doctor")
def toggle_doctor_status(
    doctor_id: int,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Toggles a doctor's active status. Inactive doctors cannot log in."""
    target = (
        db.query(models.Doctor)
        .filter(models.Doctor.id == doctor_id, models.Doctor.is_admin == False)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    target.is_active = not target.is_active
    db.commit()

    return {"message": "Status updated", "doctor_id": doctor_id, "is_active": target.is_active}


class DoctorEditRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


@router.put("/doctors/{doctor_id}", summary="Admin: Edit doctor information")
def edit_doctor(
    doctor_id: int,
    data: DoctorEditRequest,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Updates a doctor's name and/or email."""
    target = (
        db.query(models.Doctor)
        .filter(models.Doctor.id == doctor_id, models.Doctor.is_admin == False)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    if data.name:
        target.name = data.name
    if data.email:
        existing = db.query(models.Doctor).filter(
            models.Doctor.email == data.email,
            models.Doctor.id != doctor_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="This email is already used by another doctor.")
        target.email = data.email

    db.commit()
    return {"message": "Doctor updated successfully", "doctor_id": doctor_id, "name": target.name, "email": target.email}


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.put("/doctors/{doctor_id}/reset-password", summary="Admin: Reset a doctor's password")
def reset_doctor_password(
    doctor_id: int,
    data: ResetPasswordRequest,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Resets a doctor's password. Use when a doctor forgets their credentials."""
    if not data.new_password or len(data.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

    target = (
        db.query(models.Doctor)
        .filter(models.Doctor.id == doctor_id, models.Doctor.is_admin == False)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    target.hashed_password = get_password_hash(data.new_password)
    db.commit()

    return {"message": f"Password reset successfully for Dr. {target.name}.", "doctor_id": doctor_id}


@router.delete("/doctors/{doctor_id}", summary="Admin: Permanently delete a doctor")
def delete_doctor(
    doctor_id: int,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Permanently deletes a doctor and ALL associated data (scans, annotations, files, reports)."""
    target = (
        db.query(models.Doctor)
        .filter(models.Doctor.id == doctor_id, models.Doctor.is_admin == False)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    # 1. Get all scans for this doctor
    scans = db.query(models.Scan).filter(models.Scan.doctor_id == doctor_id).all()

    deleted_scans = 0
    for scan in scans:
        # Delete annotation images
        annotations = db.query(models.Annotation).filter(models.Annotation.scan_id == scan.id).all()
        for ann in annotations:
            img_path = os.path.join("snapshots", f"scan_{scan.id}_nodule_{ann.id}.png")
            if os.path.exists(img_path):
                os.remove(img_path)

        # Delete annotations from DB
        db.query(models.Annotation).filter(models.Annotation.scan_id == scan.id).delete()

        # Delete slice images directory
        slices_dir = os.path.join("snapshots", f"scan_{scan.id}_slices")
        if os.path.exists(slices_dir):
            shutil.rmtree(slices_dir, ignore_errors=True)

        # Delete uploaded CT files
        if scan.folder_path and os.path.exists(scan.folder_path):
            shutil.rmtree(scan.folder_path, ignore_errors=True)

        # Delete PDF report
        pdf_path = os.path.join("reports", f"Medical_Report_{scan.id}.pdf")
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

        # Delete scan from DB
        db.delete(scan)
        deleted_scans += 1

    # 2. Delete orphaned patients (patients with no remaining scans)
    all_patient_ids = set(s.patient_id for s in scans)
    for patient_id in all_patient_ids:
        remaining = db.query(models.Scan).filter(models.Scan.patient_id == patient_id).count()
        if remaining == 0:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if patient:
                db.delete(patient)

    # 🔴 3. حذف سجل الـ LoginHistory للطبيب ده (cascade بينفّذ ده تلقائياً)
    # لكن بنفّذه يدوياً كمان عشان نتأكد
    db.query(models.LoginHistory).filter(models.LoginHistory.doctor_id == doctor_id).delete()

    # 4. Delete the doctor
    db.delete(target)
    db.commit()

    return {
        "message": f"Doctor '{target.name}' deleted permanently.",
        "deleted_scans": deleted_scans,
        "deleted_patients": len(all_patient_ids),
    }


# ════════════════════════════════════════════════════════════════════
# 5. DOCTOR'S PATIENTS (Read-only access for admin)
# ════════════════════════════════════════════════════════════════════

@router.get("/doctors/{doctor_id}/patients", summary="Admin: View all patients of a specific doctor")
def get_doctor_patients(
    doctor_id: int,
    search: Optional[str] = Query(None),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns all patients associated with a specific doctor, with scan statistics."""
    # Verify doctor exists
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    # Get patient IDs for this doctor
    query = db.query(models.Patient).join(models.Scan).filter(models.Scan.doctor_id == doctor_id)

    if search:
        query = query.filter(
            or_(
                models.Patient.name.ilike(f"%{search}%"),
                models.Patient.patient_id_tag.ilike(f"%{search}%"),
            )
        )

    patients = query.distinct().all()
    result = []

    for p in patients:
        doctor_scans = [s for s in p.scans if s.doctor_id == doctor_id]
        if not doctor_scans:
            continue

        total_scans = len(doctor_scans)
        last_scan = max(doctor_scans, key=lambda x: x.created_at)
        completed_scans = [s for s in doctor_scans if s.status == "Completed"]
        total_nodules = 0
        max_confidence = 0.0
        for s in completed_scans:
            for ann in s.annotations:
                if ann.status != "Rejected":
                    total_nodules += 1
                    if ann.confidence and ann.confidence > max_confidence:
                        max_confidence = ann.confidence

        result.append({
            "id": p.id,
            "patient_id_tag": p.patient_id_tag,
            "name": p.name,
            "age": p.age,
            "gender": p.gender,
            "is_smoker": p.is_smoker,
            "has_previous_tumors": p.has_previous_tumors,
            "total_scans": total_scans,
            "completed_scans": len(completed_scans),
            "total_nodules": total_nodules,
            "max_confidence": max_confidence,
            "last_scan_date": last_scan.created_at.strftime("%Y-%m-%d %H:%M") if last_scan.created_at else "N/A",
            "last_scan_status": last_scan.status,
            "last_scan_display_status": _compute_display_status(last_scan),
        })

    return sorted(result, key=lambda x: x["last_scan_date"], reverse=True)


@router.get("/doctors/{doctor_id}/patients/{patient_id}", summary="Admin: Full patient details with scan timeline")
def get_patient_full_details(
    doctor_id: int,
    patient_id: int,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns complete patient information, clinical history, and scan timeline."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    # Get scans for this patient by this specific doctor
    scans = (
        db.query(models.Scan)
        .filter(models.Scan.patient_id == patient_id, models.Scan.doctor_id == doctor_id)
        .order_by(desc(models.Scan.created_at))
        .all()
    )

    # Build timeline with annotation details
    timeline = []
    for s in scans:
        annotations = db.query(models.Annotation).filter(
            models.Annotation.scan_id == s.id,
            models.Annotation.status != "Rejected",
        ).all()

        nodules_data = []
        for ann in sorted(annotations, key=lambda a: a.confidence or 0, reverse=True):
            nodules_data.append({
                "id": ann.id,
                "slice_number": ann.slice_number,
                "coord_x": ann.coord_x,
                "coord_y": ann.coord_y,
                "diameter": ann.diameter,
                "confidence": ann.confidence,
                "source": ann.source,
                "status": ann.status,
                "start_slice": ann.start_slice,
                "end_slice": ann.end_slice,
            })

        pending_count = sum(1 for a in annotations if a.status == "Pending")
        approved_count = sum(1 for a in annotations if a.status == "Approved")

        timeline.append({
            "scan_id": s.id,
            "date": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "Unknown",
            "status": s.status,
            "total_slices": s.total_slices,
            "nodules_count": len(nodules_data),
            "pending_count": pending_count,
            "approved_count": approved_count,
            "max_confidence": max([n["confidence"] for n in nodules_data]) if nodules_data else 0,
            "nodules": nodules_data,
            "has_report": os.path.exists(os.path.join("reports", f"Medical_Report_{s.id}.pdf")),
        })

    return {
        "patient_info": {
            "id": patient.id,
            "patient_id_tag": patient.patient_id_tag,
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "is_smoker": patient.is_smoker,
            "pack_years": patient.pack_years,
            "smoking_cessation_date": patient.smoking_cessation_date,
            "has_previous_tumors": patient.has_previous_tumors,
            "prev_tumors_details": patient.prev_tumors_details,
            "occupational_exposure": patient.occupational_exposure,
            "occ_exposure_details": patient.occ_exposure_details,
            "chest_pain_complaint": patient.chest_pain_complaint,
            "chest_pain_details": patient.chest_pain_details,
            "chronic_cough": patient.chronic_cough,
            "chronic_cough_details": patient.chronic_cough_details,
            "coughing_blood": patient.coughing_blood,
            "coughing_blood_details": patient.coughing_blood_details,
            "weight_loss": patient.weight_loss,
            "weight_loss_details": patient.weight_loss_details,
            "previous_chest_diseases": patient.previous_chest_diseases,
            "family_history": patient.family_history,
            "doctor_notes": patient.doctor_notes,
        },
        "doctor_info": {
            "id": doctor_id,
            "name": db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first().name,
        },
        "timeline": timeline,
    }


# ════════════════════════════════════════════════════════════════════
# 6. GLOBAL PATIENT SEARCH (across all doctors)
# ════════════════════════════════════════════════════════════════════

@router.get("/patients/search", summary="Admin: Global patient search across all doctors")
def search_patients(
    q: Optional[str] = Query(None, description="Search query: patient name or ID tag"),
    limit: int = Query(50, ge=1, le=200),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Searches for patients across ALL doctors by name or patient_id_tag.
    Returns patient info along with which doctor(s) examined them. If q is empty, returns all."""

    query = db.query(models.Patient)

    if q and q.strip():
        query = query.filter(
            or_(
                models.Patient.name.ilike(f"%{q.strip()}%"),
                models.Patient.patient_id_tag.ilike(f"%{q.strip()}%"),
            )
        )

    patients = query.order_by(desc(models.Patient.id)).limit(limit).all()

    result = []
    for p in patients:
        scans = db.query(models.Scan).filter(models.Scan.patient_id == p.id).all()
        doctor_ids = list(set(s.doctor_id for s in scans))

        examining_doctors = []
        total_nodules = 0
        total_scans = len(scans)
        latest_scan = None

        for did in doctor_ids:
            doc = db.query(models.Doctor).filter(models.Doctor.id == did).first()
            doc_scans = [s for s in scans if s.doctor_id == did]
            if not doc_scans:
                continue
            doc_last = max(doc_scans, key=lambda x: x.created_at)

            doc_nodules = 0
            for s in doc_scans:
                if s.status == "Completed":
                    for ann in s.annotations:
                        if ann.status != "Rejected":
                            doc_nodules += 1
                            total_nodules += 1

            examining_doctors.append({
                "id": doc.id,
                "name": doc.name,
                "email": doc.email,
                "is_active": doc.is_active,
                "scan_count": len(doc_scans),
                "nodules_found": doc_nodules,
                "last_exam_date": doc_last.created_at.strftime("%Y-%m-%d %H:%M") if doc_last.created_at else "N/A",
            })

        if scans:
            latest_scan = max(scans, key=lambda x: x.created_at)

        result.append({
            "id": p.id,
            "patient_id_tag": p.patient_id_tag,
            "name": p.name,
            "age": p.age,
            "gender": p.gender,
            "is_smoker": p.is_smoker,
            "has_previous_tumors": p.has_previous_tumors,
            "total_scans": total_scans,
            "total_nodules": total_nodules,
            "examining_doctors": examining_doctors,
            "latest_scan_date": latest_scan.created_at.strftime("%Y-%m-%d %H:%M") if latest_scan and latest_scan.created_at else "N/A",
            "latest_scan_status": latest_scan.status if latest_scan else None,
            "latest_scan_display_status": _compute_display_status(latest_scan) if latest_scan else None,
        })

    return result


# ════════════════════════════════════════════════════════════════════
# 7. PATIENT FULL PROFILE (all doctors who examined this patient)
# ════════════════════════════════════════════════════════════════════

@router.get("/patients/{patient_id}", summary="Admin: Full patient profile with all examining doctors")
def get_patient_profile(
    patient_id: int,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns complete patient profile including all doctors who examined them
    and their full clinical history + scan timeline per doctor."""

    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    all_scans = (
        db.query(models.Scan)
        .filter(models.Scan.patient_id == patient_id)
        .order_by(desc(models.Scan.created_at))
        .all()
    )

    doctor_data = {}
    for s in all_scans:
        if s.doctor_id not in doctor_data:
            doc = db.query(models.Doctor).filter(models.Doctor.id == s.doctor_id).first()
            doctor_data[s.doctor_id] = {
                "doctor_id": s.doctor_id,
                "doctor_name": doc.name if doc else "Unknown",
                "doctor_email": doc.email if doc else "",
                "doctor_is_active": doc.is_active if doc else False,
                "scans": [],
            }

        annotations = db.query(models.Annotation).filter(
            models.Annotation.scan_id == s.id,
            models.Annotation.status != "Rejected",
        ).all()

        nodules_data = []
        for ann in sorted(annotations, key=lambda a: a.confidence or 0, reverse=True):
            nodules_data.append({
                "id": ann.id,
                "slice_number": ann.slice_number,
                "coord_x": ann.coord_x,
                "coord_y": ann.coord_y,
                "diameter": ann.diameter,
                "confidence": ann.confidence,
                "source": ann.source,
                "status": ann.status,
                "start_slice": ann.start_slice,
                "end_slice": ann.end_slice,
            })

        doctor_data[s.doctor_id]["scans"].append({
            "scan_id": s.id,
            "date": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "Unknown",
            "status": s.status,
            "total_slices": s.total_slices,
            "nodules_count": len(nodules_data),
            "max_confidence": max([n["confidence"] for n in nodules_data]) if nodules_data else 0,
            "nodules": nodules_data,
            "has_report": os.path.exists(os.path.join("reports", f"Medical_Report_{s.id}.pdf")),
        })

    doctors_list = []
    total_nodules = 0
    for did, data in doctor_data.items():
        doc_nodules = sum(sc["nodules_count"] for sc in data["scans"])
        total_nodules += doc_nodules
        doctors_list.append({
            "doctor_id": data["doctor_id"],
            "doctor_name": data["doctor_name"],
            "doctor_email": data["doctor_email"],
            "doctor_is_active": data["doctor_is_active"],
            "total_scans": len(data["scans"]),
            "total_nodules": doc_nodules,
            "last_exam_date": data["scans"][0]["date"] if data["scans"] else "N/A",
            "timeline": data["scans"],
        })

    return {
        "patient_info": {
            "id": patient.id,
            "patient_id_tag": patient.patient_id_tag,
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "is_smoker": patient.is_smoker,
            "pack_years": patient.pack_years,
            "smoking_cessation_date": patient.smoking_cessation_date,
            "has_previous_tumors": patient.has_previous_tumors,
            "prev_tumors_details": patient.prev_tumors_details,
            "occupational_exposure": patient.occupational_exposure,
            "occ_exposure_details": patient.occ_exposure_details,
            "chest_pain_complaint": patient.chest_pain_complaint,
            "chest_pain_details": patient.chest_pain_details,
            "chronic_cough": patient.chronic_cough,
            "chronic_cough_details": patient.chronic_cough_details,
            "coughing_blood": patient.coughing_blood,
            "coughing_blood_details": patient.coughing_blood_details,
            "weight_loss": patient.weight_loss,
            "weight_loss_details": patient.weight_loss_details,
            "previous_chest_diseases": patient.previous_chest_diseases,
            "family_history": patient.family_history,
            "doctor_notes": patient.doctor_notes,
        },
        "summary": {
            "total_scans": len(all_scans),
            "total_nodules": total_nodules,
            "total_doctors": len(doctors_list),
            "latest_scan_date": all_scans[0].created_at.strftime("%Y-%m-%d %H:%M") if all_scans else "N/A",
        },
        "examining_doctors": doctors_list,
    }


# ════════════════════════════════════════════════════════════════════
# 8. SYSTEM ANALYTICS
# ════════════════════════════════════════════════════════════════════

@router.get("/analytics", summary="Admin: System analytics and performance metrics")
def get_analytics(
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns analytics data: top doctors, scan trends, risk distribution."""

    # ── Top 5 doctors by scan count ────────────────────────────
    doctor_activity = (
        db.query(
            models.Scan.doctor_id,
            func.count(models.Scan.id).label("scan_count"),
            func.count(func.distinct(models.Scan.patient_id)).label("patient_count"),
        )
        .group_by(models.Scan.doctor_id)
        .order_by(desc("scan_count"))
        .limit(5)
        .all()
    )

    top_doctors = []
    for row in doctor_activity:
        doc = db.query(models.Doctor).filter(models.Doctor.id == row.doctor_id).first()
        if doc:
            completed_scan_ids = [
                s.id for s in
                db.query(models.Scan).filter(
                    models.Scan.doctor_id == row.doctor_id,
                    models.Scan.status == "Completed"
                ).all()
            ]
            nodule_count = 0
            if completed_scan_ids:
                nodule_count = (
                    db.query(models.Annotation)
                    .filter(
                        models.Annotation.scan_id.in_(completed_scan_ids),
                        models.Annotation.status != "Rejected",
                    )
                    .count()
                )

            top_doctors.append({
                "id": doc.id,
                "name": doc.name,
                "scan_count": row.scan_count,
                "patient_count": row.patient_count,
                "nodule_count": nodule_count,
            })

    # ── Scan trends: last 14 days ─────────────────────────────
    daily_stats = []
    for i in range(13, -1, -1):
        day = datetime.utcnow() - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        day_scans = (
            db.query(models.Scan)
            .filter(and_(models.Scan.created_at >= day_start, models.Scan.created_at < day_end))
            .all()
        )
        day_completed = sum(1 for s in day_scans if s.status == "Completed")
        day_patients = len(set(s.patient_id for s in day_scans))

        daily_stats.append({
            "date": day_start.strftime("%b %d"),
            "total_scans": len(day_scans),
            "completed": day_completed,
            "unique_patients": day_patients,
        })

    # ── Risk distribution (nodule confidence ranges) ──────────
    completed_annotations = (
        db.query(models.Annotation)
        .join(models.Scan)
        .filter(
            models.Annotation.status != "Rejected",
            models.Scan.status == "Completed",
        )
        .all()
    )

    risk_categories = {"Low (0-40%)": 0, "Medium (40-70%)": 0, "High (70-90%)": 0, "Critical (90-100%)": 0}
    for ann in completed_annotations:
        conf = ann.confidence or 0
        if conf < 0.4:
            risk_categories["Low (0-40%)"] += 1
        elif conf < 0.7:
            risk_categories["Medium (40-70%)"] += 1
        elif conf < 0.9:
            risk_categories["High (70-90%)"] += 1
        else:
            risk_categories["Critical (90-100%)"] += 1

    # ── Patient demographics summary ──────────────────────────
    total_patients = db.query(models.Patient).count()
    smoker_count = db.query(models.Patient).filter(models.Patient.is_smoker == True).count()
    tumor_history = db.query(models.Patient).filter(models.Patient.has_previous_tumors == True).count()

    gender_data = (
        db.query(models.Patient.gender, func.count(models.Patient.id))
        .group_by(models.Patient.gender)
        .all()
    )
    gender_distribution = {g: c for g, c in gender_data}

    avg_scans = 0
    if total_patients > 0:
        avg_scans = round(db.query(models.Scan).count() / total_patients, 1)

    return {
        "top_doctors": top_doctors,
        "daily_trends": daily_stats,
        "risk_distribution": risk_categories,
        "demographics": {
            "total_patients": total_patients,
            "smoker_percentage": round((smoker_count / total_patients * 100) if total_patients > 0 else 0, 1),
            "tumor_history_percentage": round((tumor_history / total_patients * 100) if total_patients > 0 else 0, 1),
            "gender_distribution": gender_distribution,
            "avg_scans_per_patient": avg_scans,
        },
    }


# ════════════════════════════════════════════════════════════════════
# 9. AI MODEL MONITORING & QUEUE STATUS
# ════════════════════════════════════════════════════════════════════

@router.get("/ai-status", summary="Admin: AI model and queue monitoring status")
def get_ai_status(
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns the current AI processing status, queue length, and model health."""
    try:
        from core.ai_service import PROCESSING_QUEUE, IS_PROCESSING
        queue_length = len(PROCESSING_QUEUE)
        is_busy = IS_PROCESSING
    except ImportError:
        queue_length = 0
        is_busy = False
    except Exception:
        queue_length = 0
        is_busy = False

    processing = db.query(models.Scan).filter(models.Scan.status == "Processing").count()
    completed = db.query(models.Scan).filter(models.Scan.status == "Completed").count()
    failed = db.query(models.Scan).filter(models.Scan.status == "Failed").count()

    high_confidence_unreviewed = (
        db.query(models.Scan)
        .join(models.Annotation)
        .filter(
            models.Scan.status == "Completed",
            models.Annotation.status == "Pending",
            models.Annotation.confidence > 0.9,
        )
        .distinct()
        .count()
    )

    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    stuck_processing = (
        db.query(models.Scan)
        .filter(
            models.Scan.status == "Processing",
            models.Scan.created_at < one_hour_ago,
        )
        .count()
    )

    return {
        "is_busy": is_busy,
        "queue_length": queue_length,
        "processing_count": processing,
        "completed_count": completed,
        "failed_count": failed,
        "high_confidence_unreviewed": high_confidence_unreviewed,
        "stuck_processing": stuck_processing,
        "last_check": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ════════════════════════════════════════════════════════════════════
# 10. AI PERFORMANCE ANALYTICS
# ════════════════════════════════════════════════════════════════════

@router.get("/ai-analytics", summary="Admin: AI model performance metrics")
def get_ai_analytics(
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns detailed AI performance: approval rates, false positives, confidence stats."""
    all_annotations = (
        db.query(models.Annotation)
        .join(models.Scan)
        .filter(models.Scan.status == "Completed")
        .all()
    )

    total_detected = 0
    approved = 0
    rejected = 0
    pending = 0
    ai_sourced = 0
    manual_sourced = 0
    total_confidence = 0.0
    confidence_count = 0

    for ann in all_annotations:
        if ann.status == "Approved":
            approved += 1
            total_detected += 1
        elif ann.status == "Rejected":
            rejected += 1
        elif ann.status == "Pending":
            pending += 1
            total_detected += 1

        if ann.source == "AI":
            ai_sourced += 1
        elif ann.source == "Manual":
            manual_sourced += 1

        if ann.confidence is not None:
            total_confidence += ann.confidence
            confidence_count += 1

    avg_confidence = round((total_confidence / confidence_count) if confidence_count > 0 else 0, 3)
    approval_rate = round((approved / (approved + rejected)) * 100) if (approved + rejected) > 0 else 0
    false_positive_rate = round((rejected / (approved + rejected)) * 100) if (approved + rejected) > 0 else 0

    ai_annotations = [a for a in all_annotations if a.source == "AI"]
    ai_approved = sum(1 for a in ai_annotations if a.status == "Approved")
    ai_rejected = sum(1 for a in ai_annotations if a.status == "Rejected")
    ai_pending = sum(1 for a in ai_annotations if a.status == "Pending")
    ai_approval_rate = round((ai_approved / (ai_approved + ai_rejected)) * 100) if (ai_approved + ai_rejected) > 0 else 0
    ai_false_positive_rate = round((ai_rejected / (ai_approved + ai_rejected)) * 100) if (ai_approved + ai_rejected) > 0 else 0

    return {
        "total_annotations": len(all_annotations),
        "approved": approved,
        "rejected": rejected,
        "pending": pending,
        "approval_rate": approval_rate,
        "false_positive_rate": false_positive_rate,
        "avg_confidence": avg_confidence,
        "ai_sourced": ai_sourced,
        "manual_sourced": manual_sourced,
        "ai_analysis": {
            "total_ai_detections": len(ai_annotations),
            "approved": ai_approved,
            "rejected": ai_rejected,
            "pending": ai_pending,
            "approval_rate": ai_approval_rate,
            "false_positive_rate": ai_false_positive_rate,
        },
    }


# ════════════════════════════════════════════════════════════════════
# 11. SCAN OVERSIGHT (All scans across all doctors)
# ════════════════════════════════════════════════════════════════════

@router.get("/scans", summary="Admin: List all scans across the system")
def get_all_scans(
    doctor_id: Optional[int] = Query(None, description="Filter by doctor"),
    status: Optional[str] = Query(None, description="Filter by status: Processing, Completed, Failed, Unreviewed"),
    search: Optional[str] = Query(None, description="Search by patient name"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns all scans in the system with doctor and patient info. Admin can filter and search."""
    query = db.query(models.Scan)

    if doctor_id:
        query = query.filter(models.Scan.doctor_id == doctor_id)

    if status == "Unreviewed":
        unreviewed_scan_ids = (
            db.query(models.Annotation.scan_id)
            .filter(models.Annotation.status == "Pending")
            .distinct()
            .subquery()
        )
        query = query.filter(
            models.Scan.status == "Completed",
            models.Scan.id.in_(unreviewed_scan_ids),
        )
    elif status == "Completed":
        unreviewed_scan_ids = (
            db.query(models.Annotation.scan_id)
            .filter(models.Annotation.status == "Pending")
            .distinct()
            .subquery()
        )
        query = query.filter(
            models.Scan.status == "Completed",
            models.Scan.id.not_in(unreviewed_scan_ids),
        )
    elif status:
        query = query.filter(models.Scan.status == status)

    if search:
        query = query.join(models.Patient).filter(models.Patient.name.ilike(f"%{search}%"))

    total_count = query.count()
    scans = query.order_by(desc(models.Scan.created_at)).offset(offset).limit(limit).all()

    result = []
    for s in scans:
        doctor = db.query(models.Doctor).filter(models.Doctor.id == s.doctor_id).first()
        annotation_count = (
            db.query(models.Annotation)
            .filter(models.Annotation.scan_id == s.id, models.Annotation.status != "Rejected")
            .count()
        )
        max_conf = (
            db.query(func.max(models.Annotation.confidence))
            .filter(models.Annotation.scan_id == s.id, models.Annotation.status != "Rejected")
            .scalar() or 0
        )

        result.append({
            "scan_id": s.id,
            "patient_name": s.patient.name if s.patient else "Unknown",
            "patient_id_tag": s.patient.patient_id_tag if s.patient else "N/A",
            "doctor_name": doctor.name if doctor else "Unknown",
            "doctor_id": s.doctor_id,
            "status": s.status,
            "display_status": _compute_display_status(s),
            "total_slices": s.total_slices,
            "annotation_count": annotation_count,
            "max_confidence": max_conf,
            "created_at": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "Unknown",
            "folder_path": s.folder_path,
        })

    return {"total": total_count, "scans": result}


@router.delete("/scans/{scan_id}", summary="Admin: Emergency delete a scan")
def admin_delete_scan(
    scan_id: int,
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Emergency deletion of a scan by admin. Removes all associated data."""
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # Delete annotation images
    annotations = db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id).all()
    for ann in annotations:
        img_path = os.path.join("snapshots", f"scan_{scan_id}_nodule_{ann.id}.png")
        if os.path.exists(img_path):
            os.remove(img_path)
    db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id).delete()

    # Delete slice images
    slices_dir = os.path.join("snapshots", f"scan_{scan_id}_slices")
    if os.path.exists(slices_dir):
        shutil.rmtree(slices_dir, ignore_errors=True)

    # Delete CT files
    if scan.folder_path and os.path.exists(scan.folder_path):
        shutil.rmtree(scan.folder_path, ignore_errors=True)

    # Delete report
    pdf_path = os.path.join("reports", f"Medical_Report_{scan_id}.pdf")
    if os.path.exists(pdf_path):
        os.remove(pdf_path)

    patient_id = scan.patient_id
    db.delete(scan)
    db.commit()

    # Clean up orphaned patient
    remaining = db.query(models.Scan).filter(models.Scan.patient_id == patient_id).count()
    if remaining == 0:
        patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if patient:
            db.delete(patient)
            db.commit()

    return {"message": f"Scan #{scan_id} deleted successfully by admin."}


# ════════════════════════════════════════════════════════════════════
# 12. STORAGE MONITORING
# ════════════════════════════════════════════════════════════════════

def _get_dir_size(path: str) -> int:
    """Calculate total size of a directory in bytes."""
    total = 0
    if not os.path.exists(path):
        return 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def _format_bytes(size_bytes: int) -> str:
    """Format bytes into human-readable string."""
    if size_bytes == 0:
        return "0 B"
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


@router.get("/storage", summary="Admin: System storage usage")
def get_storage_info(
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns storage usage breakdown for uploads, snapshots, and reports."""
    uploads_size = _get_dir_size("uploads") if os.path.exists("uploads") else 0
    snapshots_size = _get_dir_size("snapshots") if os.path.exists("snapshots") else 0
    reports_size = _get_dir_size("reports") if os.path.exists("reports") else 0
    total_size = uploads_size + snapshots_size + reports_size

    uploads_count = sum(len(files) for _, _, files in os.walk("uploads")) if os.path.exists("uploads") else 0
    snapshots_count = sum(len(files) for _, _, files in os.walk("snapshots")) if os.path.exists("snapshots") else 0
    reports_count = sum(len(files) for _, _, files in os.walk("reports")) if os.path.exists("reports") else 0

    scan_count = db.query(models.Scan).count()

    return {
        "total_size_bytes": total_size,
        "total_size_formatted": _format_bytes(total_size),
        "uploads": {
            "size_bytes": uploads_size,
            "size_formatted": _format_bytes(uploads_size),
            "file_count": uploads_count,
            "percentage": round((uploads_size / total_size * 100) if total_size > 0 else 0, 1),
        },
        "snapshots": {
            "size_bytes": snapshots_size,
            "size_formatted": _format_bytes(snapshots_size),
            "file_count": snapshots_count,
            "percentage": round((snapshots_size / total_size * 100) if total_size > 0 else 0, 1),
        },
        "reports": {
            "size_bytes": reports_size,
            "size_formatted": _format_bytes(reports_size),
            "file_count": reports_count,
            "percentage": round((reports_size / total_size * 100) if total_size > 0 else 0, 1),
        },
        "total_scans_in_db": scan_count,
        "avg_size_per_scan": _format_bytes(total_size // scan_count) if scan_count > 0 else "0 B",
    }


# ════════════════════════════════════════════════════════════════════
# 13. ACTIVITY LOG (Derived from existing data)
# ════════════════════════════════════════════════════════════════════

@router.get("/activity-log", summary="Admin: System activity log")
def get_activity_log(
    limit: int = Query(50, ge=1, le=200),
    admin: models.Doctor = Depends(require_admin),
    db: Session = Depends(database.get_db),
):
    """Returns a comprehensive activity log derived from existing system data.
    Combines scan events, annotation reviews, and doctor logins into one timeline."""

    events = []

    # 1. Recent scans (uploads)
    recent_scans = (
        db.query(models.Scan)
        .order_by(desc(models.Scan.created_at))
        .limit(limit)
        .all()
    )
    for s in recent_scans:
        doctor = db.query(models.Doctor).filter(models.Doctor.id == s.doctor_id).first()
        events.append({
            "type": "scan_upload",
            "icon": "upload",
            "description": f"Scan uploaded for {s.patient.name if s.patient else 'Unknown'}",
            "actor": doctor.name if doctor else "Unknown",
            "actor_id": s.doctor_id,
            "timestamp": s.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if s.created_at else None,
            "details": {
                "scan_id": s.id,
                "patient_name": s.patient.name if s.patient else "Unknown",
                "status": s.status,
            },
        })

    # 2. Recent annotations (reviews by doctors)
    recent_annotations = (
        db.query(models.Annotation)
        .join(models.Scan)
        .order_by(desc(models.Annotation.created_at))
        .limit(limit)
        .all()
    )
    for ann in recent_annotations:
        scan = db.query(models.Scan).filter(models.Scan.id == ann.scan_id).first()
        doctor = db.query(models.Doctor).filter(models.Doctor.id == scan.doctor_id).first() if scan else None
        status_text = {
            "Approved": "Approved nodule detection",
            "Rejected": "Rejected nodule (False Positive)",
            "Pending": "Nodule pending review",
        }.get(ann.status, ann.status)

        events.append({
            "type": f"annotation_{ann.status.lower()}",
            "icon": ann.status.lower(),
            "description": f"{status_text} (Confidence: {round(ann.confidence * 100, 1)}%)" if ann.confidence else f"{status_text}",
            "actor": doctor.name if doctor else "Unknown",
            "actor_id": scan.doctor_id if scan else None,
            "timestamp": ann.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if ann.created_at else None,
            "details": {
                "annotation_id": ann.id,
                "scan_id": ann.scan_id,
                "patient_name": scan.patient.name if scan and scan.patient else "Unknown",
                "confidence": ann.confidence,
                "source": ann.source,
            },
        })

    # 3. Doctor logins (🔴🔴 من جدول LoginHistory بدل last_login column)
    login_events = (
        db.query(models.LoginHistory)
        .join(models.Doctor)
        .filter(models.Doctor.is_admin == False)
        .order_by(desc(models.LoginHistory.timestamp))
        .limit(20)
        .all()
    )
    for evt in login_events:
        doctor = evt.doctor
        events.append({
            "type": f"doctor_{evt.event_type}",  # "doctor_login" أو "doctor_logout"
            "icon": evt.event_type,
            "description": f"Doctor {evt.event_type}d",  # "Doctor logged in" أو "Doctor logged out"
            "actor": doctor.name if doctor else "Unknown",
            "actor_id": evt.doctor_id,
            "timestamp": evt.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ") if evt.timestamp else None,
            "details": {
                "is_active": doctor.is_active if doctor else False,
                "ip_address": evt.ip_address,
            },
        })

    # Sort all events by timestamp (most recent first)
    events.sort(key=lambda x: x["timestamp"] or "", reverse=True)

    return events[:limit]