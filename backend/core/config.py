from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Lung Cancer AI Detection System"
    PROJECT_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api/v1"
    
    # إعدادات الأمان (JWT Settings)
    SECRET_KEY: str = "your-super-secret-key-for-graduation-project" # مفتاح سري لتوليد التوكن
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # التوكن صالح لمدة يوم كامل

    # 🔴 إعدادات الـ CORS الديناميكية 🔴
    # نضع اللوكال هوست كقيمة افتراضية، ويمكن تغييرها من ملف .env
    BACKEND_CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        # تحويل النص المفصول بفواصل إلى قائمة (List) ليفهمها FastAPI
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        case_sensitive = True
        env_file = ".env" # قراءة المتغيرات من ملف .env لو موجود

settings = Settings()