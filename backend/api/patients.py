from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import List, Optional
from db import models, database
from core.security import get_current_doctor

router = APIRouter()

@router.get("", summary="Get all patients for the current doctor")
def get_patients(
    search: Optional[str] = None,
    current_doctor: models.Doctor = Depends(get_current_doctor),
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Patient).join(models.Scan).filter(models.Scan.doctor_id == current_doctor.id)

    if search:
        query = query.filter(
            or_(
                models.Patient.name.ilike(f"%{search}%"),
                models.Patient.patient_id_tag.ilike(f"%{search}%")
            )
        )

    patients = query.distinct().all()
    result = []
    for p in patients:
        doctor_scans = [s for s in p.scans if s.doctor_id == current_doctor.id]
        if not doctor_scans: continue
        total_scans = len(doctor_scans)
        last_scan = max(doctor_scans, key=lambda x: x.created_at)

        result.append({
            "id": p.id, "patient_id_tag": p.patient_id_tag, "name": p.name, "age": p.age, "gender": p.gender,
            "total_scans": total_scans, "last_scan_date": last_scan.created_at.strftime("%Y-%m-%d") if last_scan.created_at else "N/A",
            "is_smoker": p.is_smoker, "has_previous_tumors": p.has_previous_tumors
        })

    return sorted(result, key=lambda x: x['last_scan_date'], reverse=True)

# 🔴 المسار الجديد لجلب بيانات المريض من خلال الـ ID Tag 🔴
@router.get("/by-tag/{tag}", summary="Fetch patient by ID tag")
def get_patient_by_tag(
    tag: str,
    current_doctor: models.Doctor = Depends(get_current_doctor),
    db: Session = Depends(database.get_db)
):
    patient = db.query(models.Patient).filter(models.Patient.patient_id_tag == tag).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found in the system")
        
    return {
        "name": patient.name,
        "age": patient.age,
        "gender": patient.gender,
        "patient_id_tag": patient.patient_id_tag,
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
        "family_history": patient.family_history
    }

@router.get("/{patient_id}", summary="Get patient details and scan timeline")
def get_patient_timeline(
    patient_id: int,
    current_doctor: models.Doctor = Depends(get_current_doctor),
    db: Session = Depends(database.get_db)
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient: raise HTTPException(status_code=404, detail="Patient not found")

    scans = db.query(models.Scan).filter(models.Scan.patient_id == patient_id, models.Scan.doctor_id == current_doctor.id).order_by(desc(models.Scan.created_at)).all()
    if not scans and not current_doctor.is_admin: raise HTTPException(status_code=403, detail="Unauthorized")

    timeline = []
    for s in scans:
        nodules = [a for a in s.annotations if a.status != 'Rejected']
        timeline.append({
            "scan_id": s.id, "date": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "Unknown",
            "status": s.status, "nodules_count": len(nodules), "max_confidence": max([n.confidence for n in nodules]) if nodules else 0
        })

    return {
        "patient_info": {
            "id": patient.id, "tag": patient.patient_id_tag, "name": patient.name, "age": patient.age, "gender": patient.gender,
            "is_smoker": patient.is_smoker, "pack_years": patient.pack_years, "smoking_cessation_date": patient.smoking_cessation_date,
            "has_previous_tumors": patient.has_previous_tumors, "prev_tumors_details": patient.prev_tumors_details,
            "occupational_exposure": patient.occupational_exposure, "occ_exposure_details": patient.occ_exposure_details,
            "chest_pain_complaint": patient.chest_pain_complaint, "chest_pain_details": patient.chest_pain_details,
            "chronic_cough": patient.chronic_cough, "chronic_cough_details": patient.chronic_cough_details,
            "coughing_blood": patient.coughing_blood, "coughing_blood_details": patient.coughing_blood_details,
            "weight_loss": patient.weight_loss, "weight_loss_details": patient.weight_loss_details,
            "previous_chest_diseases": patient.previous_chest_diseases, "family_history": patient.family_history, "doctor_notes": patient.doctor_notes
        },
        "timeline": timeline
    }