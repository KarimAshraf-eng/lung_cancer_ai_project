from fastapi import APIRouter

router = APIRouter()

@router.get("/health", summary="Check Server Health")
def health_check():
    """
    مسار بسيط للتأكد من أن السيرفر يعمل بشكل صحيح ولن يواجه Timeout مبدئياً.
    """
    return {
        "status": "success",
        "message": "System is Up and Running 🚀",
        "system": "Lung Cancer AI Detection"
    }