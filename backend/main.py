import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from core.config import settings
from api import health, doctors, auth, scans, reports, dashboard, patients, windowing, ws, admin
from db.database import engine, Base
from core.ai_service import queue_worker
import os

Base.metadata.create_all(bind=engine)

def start_application() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.PROJECT_VERSION
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix=settings.API_PREFIX, tags=["System Health"])
    app.include_router(doctors.router, prefix=settings.API_PREFIX + "/doctors", tags=["Doctors Management"])
    app.include_router(auth.router, prefix=settings.API_PREFIX + "/auth", tags=["Authentication"])
    app.include_router(scans.router, prefix=settings.API_PREFIX + "/scans", tags=["Scans & AI Processing"])
    app.include_router(reports.router, prefix=settings.API_PREFIX + "/reports", tags=["Medical Reports"])
    app.include_router(dashboard.router, prefix=settings.API_PREFIX + "/dashboard", tags=["Dashboard"])
    app.include_router(patients.router, prefix=settings.API_PREFIX + "/patients", tags=["Patients Directory"])
    app.include_router(windowing.router, tags=["CT Windowing"])

    # Admin Panel - dedicated endpoints for system administrators
    app.include_router(admin.router, prefix=settings.API_PREFIX + "/admin", tags=["Admin Panel"])

    app.include_router(ws.router, prefix="/ws", tags=["WebSockets"])

    os.makedirs("snapshots", exist_ok=True)
    app.mount("/snapshots", StaticFiles(directory="snapshots"), name="snapshots")

    @app.on_event("startup")
    async def startup_event():
        asyncio.create_task(queue_worker())
        print("AI Queue Worker started.")

    return app

app = start_application()

@app.get("/", tags=["Root"])
def home():
    return {"message": "Welcome to the Medical AI Backend."}