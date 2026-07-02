import os

def generate_project_tree(dir_path, prefix=""):
    # المجلدات التي سيتم تجاهلها لتجنب حشو ملف النص بملفات غير مفيدة للـ AI
    ignore_dirs = {
        'node_modules', 'venv', 'env', '__pycache__', 
        '.git', '.vscode', '.idea', 'build', 'dist', 'coverage'
    }
    
    # الملفات التي يمكن تجاهلها (اختياري)
    ignore_files = {'.DS_Store', 'package-lock.json'}

    tree_str = ""
    try:
        items = os.listdir(dir_path)
    except PermissionError:
        return ""

    # فلترة العناصر لترتيبها وتجاهل الغير مرغوب فيه
    items = [item for item in items if item not in ignore_dirs and item not in ignore_files]
    # ترتيب المجلدات أولاً ثم الملفات
    items.sort(key=lambda x: (not os.path.isdir(os.path.join(dir_path, x)), x))

    for index, item in enumerate(items):
        path = os.path.join(dir_path, item)
        is_last = index == len(items) - 1

        # رسم فروع الشجرة
        connector = "└── " if is_last else "├── "
        tree_str += f"{prefix}{connector}{item}\n"

        if os.path.isdir(path):
            extension = "    " if is_last else "│   "
            tree_str += generate_project_tree(path, prefix=prefix + extension)

    return tree_str

def main():
    # المسار الحالي (يجب وضع السكريبت داخل مجلد lung_cancer_ai_project)
    project_dir = "." 
    output_filename = "project_structure.txt"

    print("جاري تحليل هيكلة المشروع...")

    # اسم المجلد الرئيسي في بداية الملف
    tree = f"{os.path.basename(os.path.abspath(project_dir))}/\n"
    tree += generate_project_tree(project_dir)

    # حفظ النتيجة في ملف نصي
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(tree)

    print(f"تم بنجاح! تم حفظ هيكلة المشروع بالكامل في ملف: {output_filename}")

if __name__ == "__main__":
    main()