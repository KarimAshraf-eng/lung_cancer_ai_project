from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional
import os
import shutil
import uuid
import math
from pydantic import BaseModel
from PIL import Image, ImageDraw 
from db import models, database
from core.security import get_current_doctor
from core.ai_service import add_to_queue
from schemas import annotation as annotation_schemas

router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_FILE_SIZE = 500 * 1024 * 1024 

class PatientUpdate(BaseModel):
    name: str
    age: int
    gender: str
    
    has_previous_tumors: bool
    prev_tumors_details: Optional[str] = None
    occupational_exposure: bool = False
    occ_exposure_details: Optional[str] = None
    chest_pain_complaint: bool
    chest_pain_details: Optional[str] = None
    chronic_cough: bool = False
    chronic_cough_details: Optional[str] = None
    coughing_blood: bool = False
    coughing_blood_details: Optional[str] = None
    weight_loss: bool = False
    weight_loss_details: Optional[str] = None
    
    previous_chest_diseases: Optional[str] = None
    is_smoker: bool
    pack_years: Optional[int] = 0
    smoking_cessation_date: Optional[str] = None
    family_history: Optional[str] = None
    doctor_notes: Optional[str] = None

def update_nodule_snapshot(scan_id, nodule_id, slice_number, coord_x, coord_y, diameter):
    if diameter is None:
        diameter = 40.0
        
    slice_path = os.path.join("snapshots", f"scan_{scan_id}_slices", f"slice_{slice_number}.jpg")
    out_path = os.path.join("snapshots", f"scan_{scan_id}_nodule_{nodule_id}.png")
    
    if os.path.exists(slice_path):
        try:
            img = Image.open(slice_path).convert("RGB")
            draw = ImageDraw.Draw(img)
            r = diameter / 2.0
            
            left = max(0, coord_x - r)
            top = max(0, coord_y - r)
            right = min(img.width, coord_x + r)
            bottom = min(img.height, coord_y + r)
            
            draw.rectangle([left, top, right, bottom], outline="red", width=2)
            img.save(out_path, format="PNG")
        except Exception as e:
            print(f"Error creating snapshot for nodule {nodule_id}: {e}")
    else:
        print(f"Slice path does not exist: {slice_path}")

@router.get("", summary="Get scans with pagination and filters")
def get_doctor_scans(
    page: int = Query(1, ge=1), limit: int = Query(10, ge=1, le=100), search: Optional[str] = None,
    status: Optional[str] = "All", current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)
):
    query = db.query(models.Scan).filter(models.Scan.doctor_id == current_doctor.id)
    
    if search:
        query = query.join(models.Patient, models.Scan.patient_id == models.Patient.id).filter(
            or_(models.Scan.id.ilike(f"%{search}%"), models.Patient.name.ilike(f"%{search}%"), models.Patient.patient_id_tag.ilike(f"%{search}%"))
        )

    # 🔴 التعديل هنا لفصل الـ Completed عن الـ Needs Review (Unreviewed) 🔴
    if status and status != "All":
        if status == "Needs Review":
            query = query.join(models.Annotation).filter(
                models.Scan.status == "Completed", 
                models.Annotation.status == "Pending"
            ).distinct()
        elif status == "Completed":
            needs_review_scan_ids = (
                db.query(models.Annotation.scan_id)
                .filter(models.Annotation.status == "Pending")
                .distinct()
                .subquery()
            )
            query = query.filter(
                models.Scan.status == "Completed",
                models.Scan.id.not_in(needs_review_scan_ids)
            )
        else:
            query = query.filter(models.Scan.status == status)

    total_items = query.count()
    total_pages = math.ceil(total_items / limit) if total_items > 0 else 1
    
    scans = query.options(joinedload(models.Scan.annotations)).order_by(models.Scan.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    data = []
    for s in scans:
        pending_count = sum(1 for a in s.annotations if a.status == 'Pending')
        
        derived_status = s.status
        if s.status == "Completed" and pending_count > 0:
            derived_status = "Needs Review"
            
        data.append({
            "scan_id": s.id, 
            "patient_name": s.patient.name, 
            "patient_tag": s.patient.patient_id_tag, 
            "status": s.status,
            "derived_status": derived_status,
            "pending_count": pending_count,
            "upload_date": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "Unknown"
        })
        
    return {"data": data, "total_items": total_items, "total_pages": total_pages, "current_page": page}

@router.post("/upload", summary="Upload Scan")
def upload_scan(
    patient_name: str = Form(...), patient_age: int = Form(...), patient_gender: str = Form(...), patient_tag: str = Form(...), 
    has_previous_tumors: bool = Form(False), prev_tumors_details: Optional[str] = Form(None),
    occupational_exposure: bool = Form(False), occ_exposure_details: Optional[str] = Form(None),
    chest_pain_complaint: bool = Form(False), chest_pain_details: Optional[str] = Form(None),
    chronic_cough: bool = Form(False), chronic_cough_details: Optional[str] = Form(None),
    coughing_blood: bool = Form(False), coughing_blood_details: Optional[str] = Form(None),
    weight_loss: bool = Form(False), weight_loss_details: Optional[str] = Form(None),
    previous_chest_diseases: Optional[str] = Form(None), is_smoker: bool = Form(False), pack_years: Optional[int] = Form(0), 
    smoking_cessation_date: Optional[str] = Form(None), family_history: Optional[str] = Form(None), 
    files: List[UploadFile] = File(...), current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)
):
    if len(files) != 2: raise HTTPException(status_code=400, detail="يجب رفع ملفين بالضبط: ملف .mhd وملف .raw")
    mhd_file = next((f for f in files if f.filename.lower().endswith('.mhd')), None)
    raw_file = next((f for f in files if f.filename.lower().endswith('.raw')), None)
    if not mhd_file or not raw_file: raise HTTPException(status_code=400, detail="صيغة الملفات غير صحيحة.")

    patient_data = {
        "name": patient_name, "age": patient_age, "gender": patient_gender, "patient_id_tag": patient_tag,
        "has_previous_tumors": has_previous_tumors, "prev_tumors_details": prev_tumors_details if has_previous_tumors else None,
        "occupational_exposure": occupational_exposure, "occ_exposure_details": occ_exposure_details if occupational_exposure else None,
        "chest_pain_complaint": chest_pain_complaint, "chest_pain_details": chest_pain_details if chest_pain_complaint else None,
        "chronic_cough": chronic_cough, "chronic_cough_details": chronic_cough_details if chronic_cough else None,
        "coughing_blood": coughing_blood, "coughing_blood_details": coughing_blood_details if coughing_blood else None,
        "weight_loss": weight_loss, "weight_loss_details": weight_loss_details if weight_loss else None,
        "previous_chest_diseases": previous_chest_diseases, "is_smoker": is_smoker,
        "pack_years": pack_years if is_smoker else 0, "smoking_cessation_date": smoking_cessation_date if is_smoker else None,
        "family_history": family_history, "doctor_notes": None
    }

    patient = db.query(models.Patient).filter(models.Patient.patient_id_tag == patient_tag).first()
    if not patient:
        patient = models.Patient(**patient_data)
        db.add(patient)
    else:
        for key, value in patient_data.items(): setattr(patient, key, value)
    db.commit()
    db.refresh(patient)

    scan_id = str(uuid.uuid4())
    scan_dir = os.path.join(UPLOAD_DIR, scan_id)
    os.makedirs(scan_dir, exist_ok=True)
    
    for file in files:
        file_path = os.path.join(scan_dir, file.filename)
        with open(file_path, "wb") as buffer:
            file_size = 0
            while chunk := file.file.read(1024 * 1024): 
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    buffer.close()
                    shutil.rmtree(scan_dir, ignore_errors=True) 
                    raise HTTPException(status_code=413, detail=f"الملف كبير جداً.")
                buffer.write(chunk)

    new_scan = models.Scan(id=scan_id, doctor_id=current_doctor.id, patient_id=patient.id, folder_path=scan_dir, status="Processing") 
    db.add(new_scan)
    db.commit()
    
    add_to_queue(scan_id)
    
    return {"message": "Upload started", "scan_id": scan_id}

@router.get("/{scan_id}/progress")
def get_progress(scan_id: str, db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan: return {"progress": 0, "total_slices": 0, "status": "Unknown"}
    return {"progress": scan.progress, "total_slices": scan.total_slices, "status": scan.status}

@router.get("/{scan_id}/results")
def get_scan_results(scan_id: str, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan or (scan.doctor_id != current_doctor.id and not current_doctor.is_admin): raise HTTPException(404, "Not found.")
    
    slices_dir = os.path.join("snapshots", f"scan_{scan_id}_slices")
    total_slices = len(os.listdir(slices_dir)) if os.path.exists(slices_dir) else scan.total_slices
    annotations = db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id).all()
    
    return {
        "scan_id": scan.id, "status": scan.status, "total_slices": total_slices,
        "upload_date": scan.created_at.strftime("%Y-%m-%d %H:%M") if scan.created_at else "Unknown",
        "patient_details": {
            "name": scan.patient.name, "age": scan.patient.age, "gender": scan.patient.gender, "tag": scan.patient.patient_id_tag,
            
            "has_previous_tumors": scan.patient.has_previous_tumors, "prev_tumors_details": scan.patient.prev_tumors_details,
            "occupational_exposure": scan.patient.occupational_exposure, "occ_exposure_details": scan.patient.occ_exposure_details,
            "chest_pain_complaint": scan.patient.chest_pain_complaint, "chest_pain_details": scan.patient.chest_pain_details,
            "chronic_cough": scan.patient.chronic_cough, "chronic_cough_details": scan.patient.chronic_cough_details,
            "coughing_blood": scan.patient.coughing_blood, "coughing_blood_details": scan.patient.coughing_blood_details,
            "weight_loss": scan.patient.weight_loss, "weight_loss_details": scan.patient.weight_loss_details,
            
            "previous_chest_diseases": scan.patient.previous_chest_diseases, "is_smoker": scan.patient.is_smoker, 
            "pack_years": scan.patient.pack_years, "smoking_cessation_date": scan.patient.smoking_cessation_date, 
            "family_history": scan.patient.family_history, "doctor_notes": scan.patient.doctor_notes
        },
        "results": annotations
    }

@router.put("/{scan_id}/patient")
def update_patient_details(scan_id: str, patient_data: PatientUpdate, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan: raise HTTPException(404, "Not found.")
    if scan.doctor_id != current_doctor.id and not current_doctor.is_admin: raise HTTPException(403, "Unauthorized.")

    patient = scan.patient
    for key, value in patient_data.dict().items(): setattr(patient, key, value)
    db.commit()
    return {"message": "Success"}

@router.post("/{scan_id}/annotations")
def add_annotation(scan_id: str, ann_data: annotation_schemas.AnnotationCreate, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan: raise HTTPException(404, "Not found.")
    new_ann = models.Annotation(
        scan_id=scan_id, 
        slice_number=ann_data.slice_number, 
        coord_x=ann_data.coord_x, 
        coord_y=ann_data.coord_y, 
        diameter=ann_data.diameter, 
        confidence=1.0, 
        source="Doctor", 
        status="Approved",
        start_slice=ann_data.start_slice if ann_data.start_slice is not None else max(0, ann_data.slice_number - 8),
        end_slice=ann_data.end_slice if ann_data.end_slice is not None else ann_data.slice_number + 8
    )
    db.add(new_ann)
    db.commit()
    db.refresh(new_ann)
    update_nodule_snapshot(scan_id, new_ann.id, new_ann.slice_number, new_ann.coord_x, new_ann.coord_y, new_ann.diameter)
    return new_ann

@router.put("/{scan_id}/annotations/{annotation_id}")
def update_annotation(scan_id: str, annotation_id: int, annotation_data: annotation_schemas.AnnotationUpdate, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan: raise HTTPException(404, "Not found.")
    db_ann = db.query(models.Annotation).filter(models.Annotation.id == annotation_id, models.Annotation.scan_id == scan_id).first()
    if not db_ann: raise HTTPException(404, "Not found.")
    
    if annotation_data.status is not None: db_ann.status = annotation_data.status
    if annotation_data.coord_x is not None: db_ann.coord_x = annotation_data.coord_x
    if annotation_data.coord_y is not None: db_ann.coord_y = annotation_data.coord_y
    if annotation_data.start_slice is not None: db_ann.start_slice = annotation_data.start_slice
    if annotation_data.end_slice is not None: db_ann.end_slice = annotation_data.end_slice
    
    db.commit()
    db.refresh(db_ann)
    update_nodule_snapshot(scan_id, db_ann.id, db_ann.slice_number, db_ann.coord_x, db_ann.coord_y, db_ann.diameter)
    return {"message": "Updated"}

@router.delete("/{scan_id}/annotations/{annotation_id}")
def delete_annotation(scan_id: str, annotation_id: int, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    db_ann = db.query(models.Annotation).filter(models.Annotation.id == annotation_id, models.Annotation.scan_id == scan_id).first()
    if db_ann:
        db.delete(db_ann)
        db.commit()
    return {"message": "Deleted"}

@router.post("/{scan_id}/reanalyze")
def reanalyze_scan(scan_id: str, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan: raise HTTPException(404, "Not found.")
    deleted = db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id, models.Annotation.source == "AI").delete()
    for ann in db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id).all():
        img = os.path.join("snapshots", f"scan_{scan_id}_nodule_{ann.id}.png")
        if os.path.exists(img): os.remove(img)
        
    scan.status = "Processing" 
    scan.progress = 0
    db.commit()
    add_to_queue(scan_id)
    
    return {"message": "تم", "scan_id": scan_id, "deleted_annotations": deleted}

@router.delete("/{scan_id}")
def delete_scan(scan_id: str, current_doctor: models.Doctor = Depends(get_current_doctor), db: Session = Depends(database.get_db)):
    scan = db.query(models.Scan).filter(models.Scan.id == scan_id).first()
    if not scan: raise HTTPException(404, "Not found.")
    if scan.folder_path and os.path.exists(scan.folder_path): shutil.rmtree(scan.folder_path, ignore_errors=True)
    slices_dir = os.path.join("snapshots", f"scan_{scan_id}_slices")
    if os.path.exists(slices_dir): shutil.rmtree(slices_dir, ignore_errors=True)
    for ann in scan.annotations:
        img = os.path.join("snapshots", f"scan_{scan_id}_nodule_{ann.id}.png")
        if os.path.exists(img): os.remove(img)
    pdf = os.path.join("reports", f"Medical_Report_{scan_id}.pdf")
    if os.path.exists(pdf): os.remove(pdf)
    db.query(models.Annotation).filter(models.Annotation.scan_id == scan_id).delete()
    
    patient_id = scan.patient_id
    db.delete(scan)
    db.commit()
    
    remaining_scans = db.query(models.Scan).filter(models.Scan.patient_id == patient_id).count()
    if remaining_scans == 0:
        patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if patient:
            db.delete(patient)
            db.commit()
            
    return {"message": "Deleted"}