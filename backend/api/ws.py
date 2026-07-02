from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.websocket_manager import manager

router = APIRouter()

@router.websocket("/admin-updates")
async def websocket_admin_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # إبقاء الاتصال مفتوحاً للاستماع لأي إغلاق من طرف العميل
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)