import os

# 1. تحديد مسار السكريبت الحالي
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. معالجة المسار: إذا كان السكريبت داخل مجلد backend، نرجع خطوة للخلف للمجلد الرئيسي
if os.path.basename(SCRIPT_DIR) == "backend":
    BASE_DIR = os.path.dirname(SCRIPT_DIR)
else:
    BASE_DIR = SCRIPT_DIR

# 3. مسار الملف النهائي (سيتم إنشاؤه في المجلد الرئيسي lung_cancer_ai_project)
OUTPUT_FILE = os.path.join(BASE_DIR, "project_code_summary.txt")

def write_file_content(file_path, outfile):
    # تجاهل ملفات __init__.py
    if os.path.basename(file_path) == "__init__.py":
        return
    
    if os.path.exists(file_path) and os.path.isfile(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as infile:
                content = infile.read()
            
            relative_path = os.path.relpath(file_path, BASE_DIR).replace("\\", "/")
            
            outfile.write(f"{relative_path}\n")
            outfile.write("-" * 30 + "\n")
            outfile.write(content + "\n")
            outfile.write("-" * 30 + "\n\n")
            print(f"تمت قراءة: {relative_path}")
        except Exception as e:
            print(f"❌ حدث خطأ أثناء قراءة الملف {file_path}: {e}")
    else:
        print(f"⚠️ تنبيه: الملف غير موجود - {file_path}")

def process_directory(relative_dir_path, extensions, outfile):
    full_dir_path = os.path.join(BASE_DIR, *relative_dir_path.split("/"))
    
    if not os.path.exists(full_dir_path):
        print(f"⚠️ تنبيه: المجلد غير موجود - {full_dir_path}")
        return

    # التعديل هنا: استخدام os.walk بدلاً من os.path.walk
    for root, _, files in os.walk(full_dir_path):
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                file_path = os.path.join(root, file)
                write_file_content(file_path, outfile)

def main():
    print(f"🚀 مسار المشروع الأساسي المكتشف: {BASE_DIR}")
    print("🚀 جاري بدء استخراج الأكواد...\n")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
        
        # ==========================================
        # 1. معالجة ملفات الـ Backend
        # ==========================================
        backend_specific_files = [os.path.join(BASE_DIR, "backend", "main.py")]
        backend_dirs = ["backend/api", "backend/core", "backend/db", "backend/schemas"]
        
        for file_path in backend_specific_files:
            write_file_content(file_path, outfile)
            
        for directory in backend_dirs:
            process_directory(directory, [".py"], outfile)


        # ==========================================
        # 2. معالجة ملفات الـ Frontend
        # ==========================================
        frontend_specific_files = [
            os.path.join(BASE_DIR, "frontend", "src", "App.jsx"),
            os.path.join(BASE_DIR, "frontend", "src", "main.jsx"),
            os.path.join(BASE_DIR, "frontend", "src", "App.css"),
            os.path.join(BASE_DIR, "frontend", "src", "index.css"),
            os.path.join(BASE_DIR, "frontend", "index.html"),
            os.path.join(BASE_DIR, "frontend", "tailwind.config.js"),
            os.path.join(BASE_DIR, "frontend", ".env")
        ]
        frontend_dirs = [
            "frontend/src/components",
            "frontend/src/context",
            "frontend/src/pages",
            "frontend/src/api"
        ]
        
        for file_path in frontend_specific_files:
            write_file_content(file_path, outfile)
            
        for directory in frontend_dirs:
            process_directory(directory, [".jsx", ".js", ".css"], outfile)

    print(f"\n✅ تم الانتهاء بنجاح! تم تجميع كل الأكواد في ملف: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()