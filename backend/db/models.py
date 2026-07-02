from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Doctor(Base):
    __tablename__ = "doctors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True) 
    
    scans = relationship("Scan", back_populates="doctor")

class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    patient_id_tag = Column(String, unique=True, index=True) 
    name = Column(String, index=True)
    age = Column(Integer)
    gender = Column(String)
    
    has_previous_tumors = Column(Boolean, default=False) 
    prev_tumors_details = Column(String, nullable=True)
    
    occupational_exposure = Column(Boolean, default=False)
    occ_exposure_details = Column(String, nullable=True)
    
    chest_pain_complaint = Column(Boolean, default=False) 
    chest_pain_details = Column(String, nullable=True)
    
    chronic_cough = Column(Boolean, default=False)
    chronic_cough_details = Column(String, nullable=True)
    
    coughing_blood = Column(Boolean, default=False)
    coughing_blood_details = Column(String, nullable=True)
    
    weight_loss = Column(Boolean, default=False)
    weight_loss_details = Column(String, nullable=True)
    
    previous_chest_diseases = Column(Text, nullable=True) 
    
    is_smoker = Column(Boolean, default=False) 
    pack_years = Column(Integer, default=0, nullable=True)
    smoking_cessation_date = Column(String, nullable=True) 
    
    family_history = Column(Text, nullable=True) 
    doctor_notes = Column(Text, nullable=True) 
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scans = relationship("Scan", back_populates="patient")

class Scan(Base):
    __tablename__ = "scans"
    id = Column(String, primary_key=True, index=True) 
    doctor_id = Column(Integer, ForeignKey("doctors.id"))
    patient_id = Column(Integer, ForeignKey("patients.id")) 
    folder_path = Column(String)
    status = Column(String, default="Processing") 
    
    progress = Column(Integer, default=0)
    total_slices = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    doctor = relationship("Doctor", back_populates="scans")
    patient = relationship("Patient", back_populates="scans") 
    annotations = relationship("Annotation", back_populates="scan")

class Annotation(Base):
    __tablename__ = "annotations"
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String, ForeignKey("scans.id"))
    
    slice_number = Column(Integer)
    coord_x = Column(Float)
    coord_y = Column(Float)
    diameter = Column(Float)
    confidence = Column(Float, nullable=True) 
    source = Column(String, default="AI") 
    status = Column(String, default="Pending") 
    
    # 🔴 الأعمدة الجديدة لتحديد بداية ونهاية الورم 🔴
    start_slice = Column(Integer, nullable=True)
    end_slice = Column(Integer, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scan = relationship("Scan", back_populates="annotations")