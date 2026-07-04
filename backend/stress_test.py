"""
stress_test_full_db.py
======================
Script لتوليد بيانات ضخمة (1000 طبيب، 1000 مريض، 2000 أشعة، وآلاف الأورام)
مباشرة في قاعدة البيانات (بدون رفع ملفات حقيقية عشان ميسخنش اللاب).
كمان بيولّد PDF Reports للأشعة المكتملة عن طريق الـ API.

متطلبات التشغيل:
1. ضع هذا الملف في مجلد `backend` بجوار ملف `main.py`.
2. تأكد من تثبيت المكتبات: pip install bcrypt requests
3. شغل الـ backend: uvicorn main:app --reload --port 8000
4. شغل السكريبت: python stress_test_full_db.py
"""

import sqlite3
import uuid
import random
import bcrypt
import requests
import time
import os
from datetime import datetime, timedelta

API_URL = "http://localhost:8000/api/v1"
ADMIN_EMAIL = "admin@hospital.com"  # غيّرها لبيانات الأدمن بتاعتك
ADMIN_PASSWORD = "admin1234"           # غيّرها لبيانات الأدمن بتاعتك
DB_PATH = "lung_cancer.db"

DOCTOR_NAMES = ["Ahmed", "Mohamed", "Sara", "Mona", "Karim", "Nour", "Ali", "Hana"]
PATIENT_NAMES = ["Patient_", "Mohamed_", "Sara_", "John_", "Emma_", "Ali_"]

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def generate_unique_tag(conn, prefix="HOSP-2025"):
    while True:
        tag = f"{prefix}-{random.randint(10000, 99999)}"
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM patients WHERE patient_id_tag = ?", (tag,))
        if not cursor.fetchone():
            return tag

def generate_medical_history():
    return {
        "is_smoker": random.choice([True, False]),
        "pack_years": random.randint(10, 40) if random.random() > 0.5 else 0,
        "has_previous_tumors": random.choice([True, False]),
        "prev_tumors_details": "Previous benign nodule" if random.random() > 0.7 else None,
        "chest_pain_complaint": random.choice([True, False]),
        "chest_pain_details": "Mild pain" if random.random() > 0.7 else None,
        "chronic_cough": random.choice([True, False]),
        "chronic_cough_details": "Persistent cough" if random.random() > 0.7 else None,
        "coughing_blood": random.choice([True, False]),
        "coughing_blood_details": "Hemoptysis" if random.random() > 0.8 else None,
        "weight_loss": random.choice([True, False]),
        "weight_loss_details": "5kg loss" if random.random() > 0.7 else None,
        "previous_chest_diseases": "COPD" if random.random() > 0.8 else None,
        "family_history": "Father had lung cancer" if random.random() > 0.7 else None,
        "doctor_notes": "Requires follow-up" if random.random() > 0.6 else None
    }

def admin_login():
    print("\n--- Admin Login ---")
    url = f"{API_URL}/auth/login"
    data = {"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    try:
        res = requests.post(url, data=data)
        if res.status_code == 200:
            print("✅ Admin logged in.")
            return res.cookies.get_dict().get("access_token")
        else:
            print(f"❌ Admin login failed: {res.text}")
            return None
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return None

def generate_pdf_reports(admin_token, limit=50):
    """توليد PDF Reports لعدد محدد من الأشعة المكتملة (عشان ميسخنش اللاب)"""
    print(f"\n--- Generating {limit} PDF Reports ---")
    if not admin_token:
        print("❌ No admin token, skipping PDF generation.")
        return
        
    url = f"{API_URL}/admin/scans?status=Completed&limit={limit}"
    cookies = {"access_token": admin_token}
    
    try:
        res = requests.get(url, cookies=cookies)
        if res.status_code == 200:
            scans = res.json().get("scans", [])
            print(f"  Found {len(scans)} completed scans. Generating PDFs...")
            
            for i, scan in enumerate(scans):
                scan_id = scan["scan_id"]
                pdf_url = f"{API_URL}/reports/{scan_id}/download-pdf"
                try:
                    requests.get(pdf_url, cookies=cookies)
                    if (i+1) % 10 == 0:
                        print(f"  ✅ Generated {i+1}/{len(scans)} reports...")
                except:
                    pass
            print(f"✅ PDF generation completed for {len(scans)} scans.")
    except Exception as e:
        print(f"❌ Error generating reports: {e}")

def main():
    print("=" * 60)
    print(" LungVision AI - Massive DB Stress Test (No Real Uploads)")
    print("=" * 60)
    
    if not os.path.exists(DB_PATH):
        print(f"❌ Database file '{DB_PATH}' not found. Make sure you are in the backend folder.")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. إنشاء 1000 طبيب
        print("\n--- Creating 1000 Doctors ---")
        hashed_pw = hash_password("password123")
        doctor_ids = []
        for i in range(1000):
            name = f"Dr. {random.choice(DOCTOR_NAMES)}_{i+1}"
            email = f"doctor{i+1}@test.com"
            cursor.execute(
                "INSERT INTO doctors (name, email, hashed_password, is_active, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (name, email, hashed_pw, True, False, datetime.utcnow(), datetime.utcnow())
            )
            doctor_ids.append(cursor.lastrowid)
            if (i+1) % 100 == 0:
                print(f"  ✅ Created {i+1}/1000 doctors...")
                conn.commit()
        conn.commit()
        print("✅ 1000 Doctors created successfully.")

        # 2. إنشاء 1000 مريض
        print("\n--- Creating 1000 Patients ---")
        patient_ids = []
        for i in range(1000):
            tag = generate_unique_tag(conn)
            name = f"{random.choice(PATIENT_NAMES)}{i+1}"
            age = random.randint(20, 80)
            gender = random.choice(["Male", "Female"])
            history = generate_medical_history()
            
            cursor.execute(
                """INSERT INTO patients 
                (patient_id_tag, name, age, gender, is_smoker, pack_years, has_previous_tumors, prev_tumors_details, 
                 occupational_exposure, chest_pain_complaint, chest_pain_details, chronic_cough, chronic_cough_details, 
                 coughing_blood, weight_loss, previous_chest_diseases, family_history, doctor_notes, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (tag, name, age, gender, history["is_smoker"], history["pack_years"], history["has_previous_tumors"], history["prev_tumors_details"],
                 False, history["chest_pain_complaint"], history["chest_pain_details"], history["chronic_cough"], history["chronic_cough_details"],
                 history["coughing_blood"], history["weight_loss"], history["previous_chest_diseases"], history["family_history"], history["doctor_notes"], datetime.utcnow(), datetime.utcnow())
            )
            patient_ids.append(cursor.lastrowid)
            if (i+1) % 100 == 0:
                print(f"  ✅ Created {i+1}/1000 patients...")
                conn.commit()
        conn.commit()
        print("✅ 1000 Patients created successfully.")

        # 3. إنشاء 2000 أشعة (Scans)
        print("\n--- Creating 2000 Scans ---")
        scan_ids = []
        # أوزان الحالات: Completed كتير، شوية Processing، وشوية Failed
        statuses = ["Completed"] * 7 + ["Processing"] * 2 + ["Failed"] * 1
        
        for i in range(2000):
            scan_id = str(uuid.uuid4())
            doctor_id = random.choice(doctor_ids)
            patient_id = random.choice(patient_ids)
            status = random.choice(statuses)
            progress = 100 if status == "Completed" else (random.randint(10, 90) if status == "Processing" else 0)
            
            cursor.execute(
                "INSERT INTO scans (id, doctor_id, patient_id, folder_path, status, progress, total_slices, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (scan_id, doctor_id, patient_id, f"uploads/{scan_id}", status, progress, random.randint(100, 300), datetime.utcnow(), datetime.utcnow())
            )
            scan_ids.append({"id": scan_id, "status": status})
            if (i+1) % 200 == 0:
                print(f"  ✅ Created {i+1}/2000 scans...")
                conn.commit()
        conn.commit()
        print("✅ 2000 Scans created successfully.")

        # 4. إنشاء الأورام (Annotations) للأشعة المكتملة
        print("\n--- Creating Annotations ---")
        ann_statuses = ["Approved", "Pending", "Rejected"]
        ann_count = 0
        completed_scans = [s for s in scan_ids if s["status"] == "Completed"]
        
        for scan in completed_scans:
            # 2-5 أورام لكل أشعة
            for _ in range(random.randint(2, 5)):
                cursor.execute(
                    "INSERT INTO annotations (scan_id, slice_number, coord_x, coord_y, diameter, confidence, source, status, start_slice, end_slice, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        scan["id"], random.randint(0, 200), random.randint(50, 400), random.randint(50, 400),
                        random.uniform(4.0, 30.0), random.uniform(0.45, 0.95), "AI", random.choice(ann_statuses),
                        random.randint(0, 100), random.randint(100, 200), datetime.utcnow(), datetime.utcnow()
                    )
                )
                ann_count += 1
        conn.commit()
        print(f"✅ {ann_count} Annotations created successfully.")

        # 5. توليد سجل الدخول والخروج (LoginHistory)
        print("\n--- Creating Login History ---")
        for doctor_id in doctor_ids:
            # 3-5 عمليات دخول وخروج لكل طبيب
            for _ in range(random.randint(3, 5)):
                login_time = datetime.utcnow() - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
                logout_time = login_time + timedelta(hours=random.randint(1, 8))
                cursor.execute(
                    "INSERT INTO login_history (doctor_id, event_type, timestamp, ip_address) VALUES (?, ?, ?, ?)",
                    (doctor_id, "login", login_time, "127.0.0.1")
                )
                cursor.execute(
                    "INSERT INTO login_history (doctor_id, event_type, timestamp, ip_address) VALUES (?, ?, ?, ?)",
                    (doctor_id, "logout", logout_time, "127.0.0.1")
                )
        conn.commit()
        print("✅ Login History created successfully.")

        conn.close()
        print("\n✅ Database insertion completed successfully!")

        # 6. توليد PDF Reports (50 تقرير فقط عشان ميسخنش اللاب)
        admin_token = admin_login()
        if admin_token:
            generate_pdf_reports(admin_token, limit=50)

        print("\n" + "=" * 60)
        print(" ✅ Massive Stress Test Completed Successfully!")
        print("=" * 60)
        print("You can now open your Admin Dashboard to see the massive data.")

    except KeyboardInterrupt:
        print("\n\n⚠️ Process interrupted by user (Ctrl+C). Saving progress...")
        if 'conn' in locals() and conn:
            conn.commit()
            conn.close()
        print("✅ Progress saved. Exiting gracefully.")
    except Exception as e:
        print(f"\n❌ An error occurred: {e}")

if __name__ == "__main__":
    main()