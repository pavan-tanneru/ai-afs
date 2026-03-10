"""
POST /api/resumes/process — Upload resumes + trigger async pipeline.
GET  /api/resumes/results/{session_id} — Fetch ranked results.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import json as _json
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from core.config import get_settings
from core.logging_config import get_logger
from models.schemas import (
    GraduationYearFilterConfig,
    StartProcessingResponse,
    ScoringSchema,
)
from agents.jd_agent import parse_job_description
from agents.orchestrator import (
    close_session,
    create_session,
    get_preview,
    get_results,
    get_session,
    run_pipeline,
    save_upload_to_temp,
)

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/resumes", tags=["resumes"])

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB per file


@router.post("/process", response_model=StartProcessingResponse)
async def process_resumes(
    jd_text: str = Form(...),
    files: list[UploadFile] = File(...),
    scoring_schema_json: str | None = Form(None),
    graduation_filter_json: str | None = Form(None),
):
    """
    Accepts the raw JD text + uploaded resume files.
    Parses the JD (or returns from cache), creates a session,
    streams files to disk, then launches the async pipeline.
    """
    if not jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text is required")
    if not files:
        raise HTTPException(status_code=400, detail="At least one resume file is required")

    # ── Step 1: Parse JD (cached) ──────────────────────────────────────────────
    try:
        jd_id, jd_structured, scoring_schema = await parse_job_description(jd_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JD parsing failed: {e}")

    jd_dict = jd_structured.model_dump()

    # Use user-supplied schema if provided, otherwise fall back to the generated one
    if scoring_schema_json:
        try:
            scoring_schema_dict = ScoringSchema(**_json.loads(scoring_schema_json)).model_dump()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid scoring_schema_json: {e}")
    else:
        scoring_schema_dict = scoring_schema.model_dump()

    if graduation_filter_json:
        try:
            graduation_filter_dict = GraduationYearFilterConfig(
                **_json.loads(graduation_filter_json)
            ).model_dump()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid graduation_filter_json: {e}")
    else:
        graduation_filter_dict = GraduationYearFilterConfig().model_dump()

    # ── Validate & stream files to disk ───────────────────────────────────────
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    valid_files: list[tuple[str, str, str]] = []
    skipped: list[str] = []

    for upload in files:
        # Detect file type
        suffix = Path(upload.filename or "").suffix.lower()
        content_type = upload.content_type or ""
        if suffix == ".pdf" or "pdf" in content_type:
            file_type = "pdf"
            ext = ".pdf"
        elif suffix == ".docx" or "wordprocessingml" in content_type or "openxmlformats" in content_type:
            file_type = "docx"
            ext = ".docx"
        else:
            logger.warning("skipped_unsupported_file", file=upload.filename, content_type=content_type)
            skipped.append(upload.filename or "unknown")
            continue

        # Stream to temp file
        try:
            file_bytes = await upload.read()
            if len(file_bytes) == 0:
                logger.warning("skipped_empty_file", file=upload.filename)
                skipped.append(upload.filename or "unknown")
                continue
            if len(file_bytes) > MAX_FILE_SIZE:
                logger.warning("skipped_oversized_file", file=upload.filename, size=len(file_bytes))
                skipped.append(upload.filename or "unknown")
                continue

            tmp_path = await save_upload_to_temp(file_bytes, suffix=ext)
            valid_files.append((tmp_path, upload.filename or f"resume{ext}", file_type))
        except Exception as e:
            logger.error("file_upload_error", file=upload.filename, error=str(e))
            skipped.append(upload.filename or "unknown")

    if not valid_files:
        raise HTTPException(status_code=400, detail="No valid resume files could be processed")

    # ── Create session & launch pipeline asynchronously ───────────────────────
    session_id = create_session(jd_id, len(valid_files))
    asyncio.create_task(
        run_pipeline(
            valid_files,
            session_id,
            jd_dict,
            scoring_schema_dict,
            graduation_filter_dict,
        )
    )

    logger.info(
        "pipeline_started",
        session_id=session_id,
        valid=len(valid_files),
        skipped=len(skipped),
    )

    return StartProcessingResponse(
        session_id=session_id,
        total_files=len(valid_files),
        message=(
            f"Processing {len(valid_files)} resume(s). "
            + (f"{len(skipped)} file(s) skipped: {skipped}." if skipped else "")
        ),
    )


@router.get("/results/{session_id}")
async def get_session_results(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    results = get_results(session_id)
    return {
        "session_id": session_id,
        "status": session.status,
        "total": session.total_files,
        "completed": session.completed,
        "failed": session.failed,
        "results": [r.model_dump() for r in results],
    }


@router.get("/preview-file/{session_id}/{candidate_id}")
async def get_resume_preview(session_id: str, candidate_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    preview = get_preview(session_id, candidate_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Resume preview not available")

    if preview.get("content_type") != "application/pdf":
        raise HTTPException(status_code=404, detail="Resume preview not available")

    file_path = preview.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Resume preview not available")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{preview["file_name"]}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/session/{session_id}")
async def delete_resume_session(session_id: str):
    if not close_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session closed"}
