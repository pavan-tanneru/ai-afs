"""
AI AFS  |  FastAPI Application Entry Point
Handles REST routes + WebSocket for real-time progress.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.logging_config import get_logger, setup_logging
from app.api.routes import jobs, resumes, export as export_router
from app.ws.manager import manager

setup_logging()
logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.CACHE_DIR, exist_ok=True)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    logger.info("ai_afs_started", model=settings.MODEL_NAME, concurrency=settings.MAX_CONCURRENCY)
    yield
    logger.info("ai_afs_shutdown")


app = FastAPI(
    title="AI AFS",
    description="AI-powered Resume Filtering & Candidate Ranking System",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REST Routers ──────────────────────────────────────────────────────────────
app.include_router(jobs.router)
app.include_router(resumes.router)
app.include_router(export_router.router)


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    logger.info("ws_client_connected", session_id=session_id)
    try:
        while True:
            # Keep connection alive; actual messages are sent server → client
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("ws_client_disconnected", session_id=session_id)
    finally:
        await manager.disconnect(session_id)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "app": "AI AFS", "model": settings.MODEL_NAME}
