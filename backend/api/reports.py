from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse 
from sqlalchemy.orm import Session
import os
from db import models, database
from core.security import get_current_doctor
from core.pdf_generator import create_pdf_report
import base64  

router = APIRouter()
REPORTS_DIR = "reports"
SNAPSHOTS_DIR = "snapshots"
os.makedirs(REPORTS_DIR, exist_ok=True)

def get_patient_payload(scan):
    return {
        "name": scan.patient.name, "age": scan.patient.age, "gender": scan.patient.gender, "patient_id_tag": scan.patient.patient_id_tag,
        "has_previous_tumors": scan.patient.has_previous_tumors, "prev_tumors_details": scan.patient.prev_tumors_details,
        "occupational_exposure": scan.patient.occupational_exposure, "occ_exposure_details": scan.patient.occ_exposure_details,
        "chest_pain_complaint": scan.patient.chest_pain_complaint, "chest_pain_details": scan.patient.chest_pain_details,
        "chronic_cough": scan.patient.chronic_cough, "chronic_cough_details": scan.patient.chronic_cough_details,
        "coughing_blood": scan.patient.coughing_blood, "coughing_blood_details": scan.patient.coughing_blood_details,
        "weight_loss": scan.patient.weight_loss, "weight_loss_details": scan.patient.weight_loss_details,
        "previous_chest_diseases": scan.patient.previous_chest_diseases, "is_smoker": scan.patient.is_smoker,
        "pack_years": scan.patient.pack_years, "smoking_cessation_date": scan.patient.smoking_cessation_date,
        "family_history": scan.patient.family_history, "doctor_notes": scan.patient.doctor_notes
    }

# ════════════════════════════════════════════════════════════════════
# 🔴🔴🔴 التعديل: حذف الكاش (التحقق من وجود ملف قديم)
# ════════════════════════════════════════════════════════════════════
# المشكلة: كان بيتحقق لو الـ PDF موجود، ولو موجود بيرجعه على طول.
# النتيجة: الطبيب لما يعدل بيانات المريض ويعمل Save، الـ PDF بيفضل قديم.
# الحل: دايماً اعمل generate للـ PDF جديد قبل ما ترجعه.
# ════════════════════════════════════════════════════════════════════
@router.get("/{scan_id}/download-pdf")
def download_report(scan_id: str, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan or scan.doctor_id != current_doctor.id: raise HTTPException(404, "Not found.")
    if scan.status == "Processing": raise HTTPException(400, "Processing.")

    patient_data = get_patient_payload(scan)
    annotations = db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id, models.Annotation.status != "Rejected").all()
    safe_patient_name = "".join([c for c in scan.patient.name if c.isalpha() or c.isdigit() or c==' ']).rstrip()
    download_filename = f"Report_{safe_patient_name.replace(' ', '_')}.pdf"
    pdf_path = os.path.join(REPORTS_DIR, f"Medical_Report_{scan_id}.pdf")
    
    # 🔴🔴🔴 دايماً اعمل generate للـ PDF جديد
    create_pdf_report(scan_id=scan.id, scan_date=scan.created_at, doctor_name=current_doctor.name, patient=patient_data, annotations=annotations, snapshots_dir=SNAPSHOTS_DIR, output_path=pdf_path)
    
    if not os.path.exists(pdf_path): raise HTTPException(500, "Error")
    return FileResponse(path=pdf_path, filename=download_filename, media_type='application/pdf', headers={"Access-Control-Expose-Headers": "Content-Disposition"})

@router.get("/{scan_id}/get-pdf-data")
def get_pdf_data(scan_id: str, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan or scan.doctor_id != current_doctor.id: raise HTTPException(404, "Not found.")
    if scan.status == "Processing": raise HTTPException(400, "Processing.")

    patient_data = get_patient_payload(scan)
    annotations = db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id, models.Annotation.status != "Rejected").all()
    safe_patient_name = "".join([c for c in scan.patient.name if c.isalpha() or c.isdigit() or c == ' ']).rstrip()
    download_filename = f"Report_{safe_patient_name.replace(' ', '_')}.pdf"
    pdf_path = os.path.join(REPORTS_DIR, f"Medical_Report_{scan_id}.pdf")

    # 🔴🔴🔴 دايماً اعمل generate للـ PDF جديد
    create_pdf_report(scan_id=scan.id, scan_date=scan.created_at, doctor_name=current_doctor.name, patient=patient_data, annotations=annotations, snapshots_dir=SNAPSHOTS_DIR, output_path=pdf_path)
    
    if not os.path.exists(pdf_path): raise HTTPException(500, "Error")

    with open(pdf_path, "rb") as pdf_file:
        pdf_base64 = base64.b64encode(pdf_file.read()).decode("utf-8")
    return {"filename": download_filename, "pdf_base64": pdf_base64}