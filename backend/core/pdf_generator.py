from fpdf import FPDF
import os
from datetime import datetime
import arabic_reshaper
from bidi.algorithm import get_display

def format_text(text):
    if not text: return "N/A"
    text_str = str(text)
    reshaped_text = arabic_reshaper.reshape(text_str)
    bidi_text = get_display(reshaped_text)
    return bidi_text

def create_pdf_report(scan_id: str, scan_date, doctor_name: str, patient: dict, annotations: list, snapshots_dir: str, output_path: str):
    pdf = FPDF()
    pdf.add_page()
    
    arial_path = r"C:\Windows\Fonts\arial.ttf"
    arial_bold_path = r"C:\Windows\Fonts\arialbd.ttf"
    if os.path.exists(arial_path):
        pdf.add_font("Arial", "", arial_path)
        if os.path.exists(arial_bold_path): pdf.add_font("Arial", "B", arial_bold_path)
        else: pdf.add_font("Arial", "B", arial_path)
        base_font = "Arial"
    else: base_font = "helvetica"

    pdf.set_fill_color(0, 51, 102) 
    pdf.rect(0, 0, 210, 15, 'F') 
    
    pdf.ln(10)
    pdf.set_font(base_font, "B", 22)
    pdf.set_text_color(0, 51, 102) 
    pdf.cell(0, 10, "LUNG CANCER AI DETECTION SYSTEM", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(base_font, "", 12)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, "Official Radiological & AI Analysis Report", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.set_font(base_font, "B", 10)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(30, 5, "Scan Date:")
    pdf.set_font(base_font, "", 10)
    
    display_date = scan_date.strftime("%Y-%m-%d %H:%M") if scan_date else datetime.now().strftime("%Y-%m-%d %H:%M")
    pdf.cell(80, 5, display_date)
    
    pdf.set_font(base_font, "B", 10)
    pdf.cell(30, 5, "Reviewed By:")
    pdf.set_font(base_font, "", 10)
    pdf.cell(0, 5, format_text(f"Dr. {doctor_name}"), new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font(base_font, "B", 10)
    pdf.cell(30, 5, "Scan ID:")
    pdf.set_font(base_font, "", 9)
    pdf.cell(0, 5, str(scan_id), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)

    pdf.set_fill_color(245, 247, 250) 
    pdf.set_draw_color(200, 200, 200) 
    
    start_y = pdf.get_y()
    pdf.rect(10, start_y, 190, 25, 'FD') 
    
    pdf.set_xy(12, start_y + 3)
    pdf.set_font(base_font, "B", 12)
    pdf.set_text_color(0, 51, 102)
    pdf.cell(0, 6, "Patient Details", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_text_color(0, 0, 0)
    pdf.set_font(base_font, "B", 10)
    pdf.set_xy(12, start_y + 12)
    pdf.cell(15, 6, "Name:")
    pdf.set_font(base_font, "", 10)
    pdf.cell(75, 6, format_text(patient.get('name')))
    
    pdf.set_font(base_font, "B", 10)
    pdf.cell(15, 6, "Age:")
    pdf.set_font(base_font, "", 10)
    pdf.cell(20, 6, str(patient.get('age', 'N/A')))
    
    pdf.set_font(base_font, "B", 10)
    pdf.cell(20, 6, "Gender:")
    pdf.set_font(base_font, "", 10)
    pdf.cell(0, 6, format_text(patient.get('gender')), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    start_y = pdf.get_y()
    
    # 🔴 دمج التفاصيل بجانب كل عرض 🔴
    symptoms = []
    
    if patient.get('has_previous_tumors'):
        det = patient.get('prev_tumors_details')
        symptoms.append(f"Previous Tumors ({det})" if det else "Previous Tumors")
        
    if patient.get('occupational_exposure'):
        det = patient.get('occ_exposure_details')
        symptoms.append(f"Occ. Exposure ({det})" if det else "Occ. Exposure")
        
    if patient.get('chest_pain_complaint'):
        det = patient.get('chest_pain_details')
        symptoms.append(f"Chest Pain ({det})" if det else "Chest Pain")
        
    if patient.get('chronic_cough'):
        det = patient.get('chronic_cough_details')
        symptoms.append(f"Chronic Cough ({det})" if det else "Chronic Cough")
        
    if patient.get('coughing_blood'):
        det = patient.get('coughing_blood_details')
        symptoms.append(f"Hemoptysis ({det})" if det else "Hemoptysis")
        
    if patient.get('weight_loss'):
        det = patient.get('weight_loss_details')
        symptoms.append(f"Weight Loss ({det})" if det else "Weight Loss")

    symptoms_str = ", ".join(symptoms) if symptoms else "None reported"

    smoker_status = "Yes" if patient.get('is_smoker') else "No"
    if patient.get('is_smoker'):
        if patient.get('pack_years'): smoker_status += f" ({patient.get('pack_years')} Pack-years)"
        if patient.get('smoking_cessation_date'): smoker_status += f" [Quit on: {format_text(patient.get('smoking_cessation_date'))}]"
    
    history_lines = [
        f"- Smoker: {smoker_status}",
        f"- Reported Symptoms & Exposures: {format_text(symptoms_str)}"
    ]
    
    if patient.get('previous_chest_diseases'): history_lines.append(f"- Previous Chest Diseases: {format_text(patient.get('previous_chest_diseases'))}")
    if patient.get('family_history'): history_lines.append(f"- Family History: {format_text(patient.get('family_history'))}")

    box_height = 15 + (len(history_lines) * 8) # زيادة المسافة بين الأسطر بسبب دمج النصوص الطويلة
    pdf.rect(10, start_y, 190, box_height, 'FD') 
    
    pdf.set_xy(12, start_y + 3)
    pdf.set_font(base_font, "B", 12)
    pdf.set_text_color(0, 51, 102)
    pdf.cell(0, 6, "Clinical History", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_text_color(0, 0, 0)
    pdf.set_font(base_font, "", 10)
    pdf.set_y(start_y + 10)
    for line in history_lines:
        pdf.set_x(15)
        pdf.multi_cell(180, 6, line)
        pdf.ln(2)
        
    pdf.set_y(start_y + box_height + 5) 

    pdf.set_font(base_font, "B", 14)
    pdf.set_text_color(0, 51, 102)
    pdf.cell(0, 10, "Radiological Findings (Nodules):", new_x="LMARGIN", new_y="NEXT")
    pdf.line(10, pdf.get_y(), 200, pdf.get_y()) 
    pdf.ln(5)

    pdf.set_text_color(0, 0, 0)
    sorted_annotations = sorted(annotations, key=lambda x: x.slice_number)
    
    if not sorted_annotations:
        pdf.set_font(base_font, "I", 11)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 10, "No significant nodules detected or approved.", new_x="LMARGIN", new_y="NEXT")
    else:
        for i, ann in enumerate(sorted_annotations):
            if pdf.get_y() > 230: pdf.add_page()
            current_y = pdf.get_y()
            img_path = os.path.join(snapshots_dir, f"scan_{scan_id}_nodule_{ann.id}.png")
            
            if os.path.exists(img_path): pdf.image(img_path, x=15, y=current_y, w=45, h=45)
            else:
                pdf.rect(15, current_y, 45, 45) 
                pdf.set_xy(15, current_y + 20)
                pdf.set_text_color(255, 0, 0)
                pdf.cell(45, 5, "No Image", align="C")
                pdf.set_text_color(0, 0, 0)

            text_x = 65
            pdf.set_xy(text_x, current_y + 5)
            pdf.set_font(base_font, "B", 12)
            pdf.cell(0, 6, f"Nodule #{i + 1}") 
            
            pdf.set_font(base_font, "", 11)
            pdf.set_xy(text_x, current_y + 13)
            pdf.cell(0, 6, f"• Slice Number: {ann.slice_number}")
            pdf.set_xy(text_x, current_y + 20)
            pdf.cell(0, 6, f"• AI Confidence: {round((ann.confidence or 0) * 100, 1)}%")
            pdf.set_xy(text_x, current_y + 27)
            pdf.cell(0, 6, f"• Status: {ann.status}  |  Source: {ann.source}")
            pdf.set_y(current_y + 55)

    if patient.get('doctor_notes'):
        if pdf.get_y() > 220: pdf.add_page()
        pdf.ln(5)
        pdf.set_font(base_font, "B", 14)
        pdf.set_text_color(0, 51, 102)
        pdf.cell(0, 10, "Final Radiological Impression:", new_x="LMARGIN", new_y="NEXT")
        pdf.line(10, pdf.get_y(), 200, pdf.get_y()) 
        pdf.ln(5)
        
        pdf.set_text_color(0, 0, 0)
        pdf.set_font(base_font, "", 11)
        pdf.multi_cell(0, 6, format_text(patient.get('doctor_notes')))
        pdf.ln(10)

    pdf.set_y(-25) 
    pdf.set_font(base_font, "", 8) 
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, "Disclaimer: This report was generated with the assistance of an AI Model.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, format_text("التشخيص النهائي وخطة العلاج هما مسؤولية الطبيب المعالج فقط."), align="C")
    pdf.output(output_path)
    return output_path