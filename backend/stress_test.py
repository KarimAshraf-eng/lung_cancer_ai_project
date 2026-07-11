"""
stress_test_pro_v2.py
=====================
سكريبت احترافي لتوليد بيانات ضخمة وواقعية للمشروع (الإصدار الثاني):

1. ينشئ 100 طبيب (كل طبيب له 5 مرضى).
2. يولد بيانات الأشعة والـ AI بشكل وهمي بحيث تظهر صفحة الـ Analytics
   أن المودل قوي واحترافي بنسبة 95% (Approval Rate = 95%, FP Rate = 5%).
3. يملأ بيانات المرضى الطبية بطريقة واقعية جداً (تدخين، أعراض، تاريخ عائلي).
4. يختبر الـ Doctor Activity Monitor من خلال تسجيلات دخول وخروج متعددة.
5. يصدّر بيانات الدكاترة (الاسم، الإيميل، الباسوورد) إلى ملف Excel.

متطلبات التشغيل:
1. ضع هذا الملف في مجلد `backend` بجوار ملف `main.py`.
2. pip install bcrypt openpyxl
3. شغل الـ backend: uvicorn main:app --reload --port 8000
4. شغل السكريبت: python stress_test_pro_v2.py
"""

import sqlite3
import uuid
import random
import bcrypt
import os
from datetime import datetime, timedelta
from openpyxl import Workbook

DB_PATH = "lung_cancer.db"
EXCEL_OUTPUT = "doctors_credentials.xlsx"

DOCTOR_FIRST_NAMES = [
    "Ahmed", "Mohamed", "Mahmoud", "Karim", "Tarek", "Omar", "Khaled", "Hassan",
    "Youssef", "Ali", "Amr", "Sherif", "Mostafa", "Wael", "Hatem", "Ibrahim",
    "Sara", "Mona", "Nour", "Hana", "Yasmin", "Donia", "Farida", "Ganna",
    "Habiba", "Salma", "Aya", "Basma", "Dina", "Esraa", "Fatma", "Heba",
    "Reem", "Sondos", "Tasneem", "Walaa", "Yara", "Zainab", "Asmaa", "Mariam"
]

DOCTOR_LAST_NAMES = [
    "Hassan", "Ibrahim", "Sayed", "Gouda", "Attia", "El-Sayed", "Mohamed",
    "Ali", "Abdelrahman", "Khalil", "Mansour", "Fouad", "Nabil", "Rashed",
    "Adel", "Sami", "Tawfik", "Zaki", "Badr", "Ezzat"
]

PATIENT_FIRST_NAMES = [
    "John", "Emma", "Michael", "Olivia", "David", "Sophia", "James", "Isabella",
    "Robert", "Mia", "William", "Charlotte", "Daniel", "Amelia", "Joseph",
    "Harper", "Christopher", "Evelyn", "Andrew", "Abigail", "Omar", "Layla",
    "Khaled", "Maryam", "Hassan", "Aisha", "Youssef", "Fatma", "Karim", "Nour"
]

PATIENT_LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"
]

SYMPTOM_DETAILS = {
    "chest_pain": [
        "Sharp pain on deep inspiration, right side, lasting 3 days",
        "Dull ache in sternum, worsens with exertion",
        "Pleuritic pain, intermittent, rated 4/10",
        "Burning sensation in chest after eating, no radiation"
    ],
    "chronic_cough": [
        "Productive cough with white sputum for 4 months",
        "Dry persistent cough, worse in mornings",
        "Cough lasting 8 weeks, not responding to antibiotics",
        "Nighttime cough, associated with post-nasal drip"
    ],
    "coughing_blood": [
        "Two episodes of hemoptysis, small amount of bright red blood",
        "Blood-streaked sputum for 1 week",
        "Single episode of coughing up frank blood"
    ],
    "weight_loss": [
        "Unintentional 6kg weight loss over 2 months",
        "Loss of appetite, 4kg weight loss in 1 month",
        "10% body weight reduction in 3 months without dieting"
    ],
    "prev_tumors": [
        "Right upper lobe carcinoid tumor resected in 2018",
        "Benign pulmonary nodule removed 5 years ago",
        "History of colon cancer, in remission"
    ],
    "occ_exposure": [
        "Worked in shipyard for 15 years (asbestos exposure)",
        "Construction worker, exposed to silica dust for 10 years",
        "Chemical plant worker, exposed to vinyl chloride"
    ],
    "prev_chest_diseases": [
        "COPD (GOLD Stage II), on bronchodilators",
        "Pulmonary tuberculosis treated in 2015",
        "Mild asthma, controlled with inhaler",
        "Bronchiectasis in left lower lobe"
    ],
    "family_history": [
        "Father diagnosed with lung cancer at age 65",
        "Mother had breast cancer, maternal uncle had lung cancer",
        "Sibling with pulmonary fibrosis",
        "Strong family history of smoking-related cancers"
    ],
    "doctor_notes": [
        "Patient reports persistent cough and shortness of breath. Recommend low-dose CT follow-up in 6 months.",
        "Incidental nodule found on routine chest X-ray. CT scan recommended for further characterization.",
        "High-risk patient (heavy smoker, family history). Discussed lung cancer screening importance.",
        "Patient referred for evaluation of solitary pulmonary nodule. PET-CT may be considered.",
        "Stable nodule on previous imaging. Recommend annual surveillance CT."
    ]
}

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def generate_unique_tag(conn):
    while True:
        tag = f"HOSP-2025-{random.randint(10000, 99999)}"
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM patients WHERE patient_id_tag = ?", (tag,))
        if not cursor.fetchone():
            return tag

def generate_realistic_medical_history():
    """توليد بيانات طبية واقعية جداً"""
    is_smoker = random.choices([True, False], weights=[60, 40])[0]
    pack_years = 0
    smoking_cessation_date = None

    if is_smoker:
        pack_years = random.choice([10, 15, 20, 25, 30, 35, 40, 45])
        # 20% فرصة إنه وقف التدخين
        if random.random() < 0.2:
            quit_year = random.choice(["2019", "2020", "2021", "2022", "2023"])
            quit_month = random.choice(["January", "March", "May", "July", "September", "November"])
            smoking_cessation_date = f"{quit_month} {quit_year}"

    # الأعراض (30-40% فرصة وجود عارض)
    has_chest_pain = random.random() < 0.3
    has_chronic_cough = random.random() < 0.4
    has_coughing_blood = random.random() < 0.1  # نادر
    has_weight_loss = random.random() < 0.2
    has_prev_tumors = random.random() < 0.15
    has_occ_exposure = random.random() < 0.2

    return {
        "is_smoker": is_smoker,
        "pack_years": pack_years,
        "smoking_cessation_date": smoking_cessation_date,
        "has_previous_tumors": has_prev_tumors,
        "prev_tumors_details": random.choice(SYMPTOM_DETAILS["prev_tumors"]) if has_prev_tumors else None,
        "occupational_exposure": has_occ_exposure,
        "occ_exposure_details": random.choice(SYMPTOM_DETAILS["occ_exposure"]) if has_occ_exposure else None,
        "chest_pain_complaint": has_chest_pain,
        "chest_pain_details": random.choice(SYMPTOM_DETAILS["chest_pain"]) if has_chest_pain else None,
        "chronic_cough": has_chronic_cough,
        "chronic_cough_details": random.choice(SYMPTOM_DETAILS["chronic_cough"]) if has_chronic_cough else None,
        "coughing_blood": has_coughing_blood,
        "coughing_blood_details": random.choice(SYMPTOM_DETAILS["coughing_blood"]) if has_coughing_blood else None,
        "weight_loss": has_weight_loss,
        "weight_loss_details": random.choice(SYMPTOM_DETAILS["weight_loss"]) if has_weight_loss else None,
        "previous_chest_diseases": random.choice(SYMPTOM_DETAILS["prev_chest_diseases"]) if random.random() < 0.25 else None,
        "family_history": random.choice(SYMPTOM_DETAILS["family_history"]) if random.random() < 0.3 else None,
        "doctor_notes": random.choice(SYMPTOM_DETAILS["doctor_notes"]) if random.random() < 0.6 else None
    }

def create_doctors(conn, count=100):
    """إنشاء 100 طبيب"""
    print(f"\n--- Creating {count} Doctors ---")
    cursor = conn.cursor()
    hashed_pw = hash_password("doctor123")
    doctors = []

    for i in range(count):
        first = random.choice(DOCTOR_FIRST_NAMES)
        last = random.choice(DOCTOR_LAST_NAMES)
        name = f"Dr. {first} {last}"
        email = f"doctor{i+1}@lungvision.com"

        cursor.execute(
            "INSERT INTO doctors (name, email, hashed_password, is_active, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (name, email, hashed_pw, True, False, datetime.utcnow(), datetime.utcnow())
        )
        doctor_id = cursor.lastrowid
        doctors.append({"id": doctor_id, "name": name, "email": email, "password": "doctor123"})

        if (i + 1) % 20 == 0:
            conn.commit()
            print(f"  ✅ Created {i+1}/{count} doctors...")

    conn.commit()
    print(f"✅ {count} doctors created successfully.")
    return doctors

def create_patients_and_scans(conn, doctors, patients_per_doctor=5):
    """إنشاء 5 مرضى لكل طبيب مع أشعة وأورام بحيث الـ Analytics يظهر 95% approval"""
    print(f"\n--- Creating {patients_per_doctor} patients per doctor (with realistic medical history) ---")
    cursor = conn.cursor()
    total_patients = 0
    total_scans = 0
    total_annotations = 0

    for doc_idx, doctor in enumerate(doctors):
        for p in range(patients_per_doctor):
            # 1. إنشاء المريض ببيانات واقعية
            tag = generate_unique_tag(conn)
            pname = f"{random.choice(PATIENT_FIRST_NAMES)} {random.choice(PATIENT_LAST_NAMES)}"
            age = random.randint(25, 85)
            gender = random.choice(["Male", "Female"])
            history = generate_realistic_medical_history()

            cursor.execute(
                """INSERT INTO patients
                (patient_id_tag, name, age, gender, is_smoker, pack_years, smoking_cessation_date,
                 has_previous_tumors, prev_tumors_details, occupational_exposure, occ_exposure_details,
                 chest_pain_complaint, chest_pain_details, chronic_cough, chronic_cough_details,
                 coughing_blood, coughing_blood_details, weight_loss, weight_loss_details,
                 previous_chest_diseases, family_history, doctor_notes,
                 created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (tag, pname, age, gender, history["is_smoker"], history["pack_years"],
                 history["smoking_cessation_date"], history["has_previous_tumors"],
                 history["prev_tumors_details"], history["occupational_exposure"],
                 history["occ_exposure_details"], history["chest_pain_complaint"],
                 history["chest_pain_details"], history["chronic_cough"],
                 history["chronic_cough_details"], history["coughing_blood"],
                 history["coughing_blood_details"], history["weight_loss"],
                 history["weight_loss_details"], history["previous_chest_diseases"],
                 history["family_history"], history["doctor_notes"],
                 datetime.utcnow(), datetime.utcnow())
            )
            patient_id = cursor.lastrowid
            total_patients += 1

            # 2. إنشاء 1-2 أشعة لكل مريض (كلها Completed)
            num_scans = random.choice([1, 1, 2])
            for s in range(num_scans):
                scan_id = str(uuid.uuid4())
                cursor.execute(
                    "INSERT INTO scans (id, doctor_id, patient_id, folder_path, status, progress, total_slices, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                    (scan_id, doctor["id"], patient_id, f"uploads/{scan_id}", "Completed", 100, random.randint(100, 350), datetime.utcnow(), datetime.utcnow())
                )
                total_scans += 1

                # 3. إنشاء الأورام (95% Approved, 5% Rejected)
                num_nodules = random.choices([0, 1, 2, 3, 4], weights=[10, 30, 30, 20, 10])[0]

                for n in range(num_nodules):
                    if random.random() < 0.95:
                        status = "Approved"
                        source = "AI"
                        confidence = round(random.uniform(0.82, 0.98), 3)
                        diameter = round(random.uniform(6.0, 25.0), 1)
                    else:
                        status = "Rejected"
                        source = "AI"
                        confidence = round(random.uniform(0.50, 0.75), 3)
                        diameter = round(random.uniform(4.0, 10.0), 1)

                    cursor.execute(
                        """INSERT INTO annotations
                        (scan_id, slice_number, coord_x, coord_y, diameter, confidence, source, status,
                         start_slice, end_slice, created_at, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (scan_id, random.randint(0, 250), random.randint(50, 450),
                         random.randint(50, 450), diameter, confidence, source, status,
                         random.randint(0, 100), random.randint(100, 200),
                         datetime.utcnow(), datetime.utcnow())
                    )
                    total_annotations += 1

        if (doc_idx + 1) % 20 == 0:
            conn.commit()
            print(f"  ✅ Processed {doc_idx+1}/{len(doctors)} doctors ({total_patients} patients, {total_scans} scans, {total_annotations} nodules)...")

    conn.commit()
    print(f"\n✅ Data generation completed:")
    print(f"   - Patients: {total_patients}")
    print(f"   - Scans:    {total_scans}")
    print(f"   - Nodules:  {total_annotations}")
    print(f"   - Expected Approval Rate: ~95%")
    print(f"   - Expected False Positive Rate: ~5%")

def create_login_history(conn, doctors):
    """توليد سجل دخول وخروج مكثف لكل طبيب (5-10 مرات)"""
    print(f"\n--- Generating Login/Logout History ---")
    cursor = conn.cursor()
    total_events = 0

    for doctor in doctors:
        num_sessions = random.randint(5, 10)
        for _ in range(num_sessions):
            login_time = datetime.utcnow() - timedelta(
                days=random.randint(0, 30),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )
            logout_time = login_time + timedelta(hours=random.randint(1, 8))

            cursor.execute(
                "INSERT INTO login_history (doctor_id, event_type, timestamp, ip_address) VALUES (?, ?, ?, ?)",
                (doctor["id"], "login", login_time, "127.0.0.1")
            )
            cursor.execute(
                "INSERT INTO login_history (doctor_id, event_type, timestamp, ip_address) VALUES (?, ?, ?, ?)",
                (doctor["id"], "logout", logout_time, "127.0.0.1")
            )
            total_events += 2

    conn.commit()
    print(f"✅ {total_events} login/logout events created for {len(doctors)} doctors.")

def export_to_excel(doctors):
    """تصدير بيانات الدكاترة إلى ملف Excel"""
    print(f"\n--- Exporting Doctors to Excel ---")
    wb = Workbook()
    ws = wb.active
    ws.title = "Doctors Credentials"

    headers = ["ID", "Name", "Email", "Password", "Is Active"]
    ws.append(headers)

    for col in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col)
        cell.font = cell.font.copy(bold=True)

    for doc in doctors:
        ws.append([doc["id"], doc["name"], doc["email"], doc["password"], "Yes"])

    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 25
    ws.column_dimensions['C'].width = 30
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 10

    wb.save(EXCEL_OUTPUT)
    print(f"✅ Excel file saved: {EXCEL_OUTPUT}")

def print_summary(doctors):
    """طباعة ملخص نهائي"""
    print("\n" + "=" * 60)
    print(" ✅ Stress Test Pro V2 Completed Successfully!")
    print("=" * 60)
    print(f" 📊 Summary:")
    print(f"   - Doctors created:    {len(doctors)}")
    print(f"   - Patients per doctor: 5 (total: {len(doctors) * 5})")
    print(f"   - Scans per patient:   1-2 (all Completed)")
    print(f"   - Annotations:         0-4 per scan (95% Approved, 5% Rejected)")
    print(f"   - Login history:       5-10 sessions per doctor")
    print(f"   - Excel file:          {EXCEL_OUTPUT}")
    print(f"\n 🔑 Doctor login credentials:")
    print(f"   Email:    doctor1@lungvision.com ... doctor100@lungvision.com")
    print(f"   Password: doctor123")
    print(f"\n 📈 Expected Analytics:")
    print(f"   - Approval Rate:       ~95%")
    print(f"   - False Positive Rate: ~5%")
    print(f"   - Avg Confidence:      ~0.90")
    print(f"   - All scans: Completed (no stuck/processing)")

def main():
    print("=" * 60)
    print(" LungVision AI - Professional Stress Test V2")
    print("=" * 60)
    print(" ℹ️ Press Ctrl+C to stop safely at any time.")

    if not os.path.exists(DB_PATH):
        print(f"❌ Database '{DB_PATH}' not found. Run this from the backend folder.")
        return

    try:
        conn = sqlite3.connect(DB_PATH)

        # 1. إنشاء 100 طبيب
        doctors = create_doctors(conn, count=100)

        # 2. إنشاء 5 مرضى لكل طبيب + أشعة + أورام (95% Approved)
        create_patients_and_scans(conn, doctors, patients_per_doctor=5)

        # 3. توليد سجل الدخول والخروج
        create_login_history(conn, doctors)

        conn.close()

        # 4. تصدير الدكاترة إلى Excel
        export_to_excel(doctors)

        # 5. ملخص نهائي
        print_summary(doctors)

    except KeyboardInterrupt:
        print("\n\n⚠️ Interrupted by user (Ctrl+C). Saving progress...")
        if 'conn' in locals():
            conn.commit()
            conn.close()
        print("✅ Progress saved. Exiting.")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
