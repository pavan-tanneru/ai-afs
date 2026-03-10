"""
Main orchestrator: manages session state, file handling, concurrency,
and drives the LangGraph pipeline for each resume.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import tempfile
import uuid
from pathlib import Path
from typing import Any

from core.config import get_settings
from core.logging_config import get_logger
from models.schemas import CandidateResult, SessionInfo
from agents.resume_agent import resume_graph, ResumeState
from server.ws.manager import manager

logger = get_logger(__name__)
settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".docx"}

# ─── In-memory session store (single-process) ─────────────────────────────────
_sessions: dict[str, SessionInfo] = {}
_results: dict[str, list[CandidateResult]] = {}
_previews: dict[str, dict[str, dict[str, str]]] = {}


def create_session(jd_hash: str, total_files: int) -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = SessionInfo(
        session_id=session_id,
        jd_hash=jd_hash,
        total_files=total_files,
    )
    _results[session_id] = []
    _previews[session_id] = {}
    return session_id


def get_session(session_id: str) -> SessionInfo | None:
    return _sessions.get(session_id)


def get_results(session_id: str) -> list[CandidateResult]:
    return sorted(_results.get(session_id, []), key=lambda r: (r.score or -1), reverse=True)


def get_preview(session_id: str, candidate_id: str) -> dict[str, str] | None:
    return _previews.get(session_id, {}).get(candidate_id)


def close_session(session_id: str) -> bool:
    session = _sessions.pop(session_id, None)
    previews = _previews.pop(session_id, {})
    _results.pop(session_id, None)

    for preview in previews.values():
        file_path = preview.get("file_path")
        if not file_path:
            continue
        try:
            os.unlink(file_path)
        except OSError:
            logger.warning("preview_file_cleanup_failed", session_id=session_id, file_path=file_path)

    return session is not None


def _build_initial_state(
    file_path: str,
    file_name: str,
    file_type: str,
    session_id: str,
    candidate_id: str,
    jd_dict: dict[str, Any],
    scoring_schema_dict: dict[str, Any],
    graduation_filter_dict: dict[str, Any],
    file_hash: str = "",
) -> ResumeState:
    return ResumeState(
        file_name=file_name,
        file_path=file_path,
        file_type=file_type,
        file_hash=file_hash,
        session_id=session_id,
        candidate_id=candidate_id,
        jd_structured=jd_dict,
        scoring_schema=scoring_schema_dict,
        graduation_filter=graduation_filter_dict,
        raw_text=None,
        parse_method="primary",
        parse_confidence=0.0,
        parse_error=None,
        resume_structured=None,
        llm_error=None,
        screening_reason=None,
        screening_outcome="ranked",
        graduation_year_info=None,
        evaluation=None,
        eval_error=None,
        stage="queued",
        error=None,
    )


async def _process_single_resume(
    file_path: str,
    file_name: str,
    file_type: str,
    session_id: str,
    candidate_id: str,
    jd_dict: dict[str, Any],
    scoring_schema_dict: dict[str, Any],
    graduation_filter_dict: dict[str, Any],
    semaphore: asyncio.Semaphore,
    file_hash: str = "",
) -> CandidateResult:
    """Run the LangGraph pipeline for one resume under the concurrency semaphore."""
    async with semaphore:
        logger.info("resume_processing_start", file=file_name, session=session_id)

        # Emit queued → parsing transition
        await manager.send(session_id, {
            "type": "progress",
            "session_id": session_id,
            "candidate_id": candidate_id,
            "stage": "queued",
            "message": f"Starting {file_name}…",
            "data": {},
        })

        initial_state = _build_initial_state(
            file_path, file_name, file_type, session_id, candidate_id,
            jd_dict, scoring_schema_dict, graduation_filter_dict, file_hash
        )

        try:
            final_state = await resume_graph.ainvoke(initial_state)
        except Exception as e:
            logger.error("graph_invocation_error", file=file_name, error=str(e))
            final_state = {**initial_state, "stage": "error", "error": str(e)}

        if file_type == "pdf":
            _previews.setdefault(session_id, {})[candidate_id] = {
                "file_path": file_path,
                "file_name": file_name,
                "content_type": "application/pdf",
            }

        # Build CandidateResult from final state
        result = _state_to_result(final_state, candidate_id, file_name)

        # Emit error event if pipeline failed before evaluate_node sent a result
        if result.stage != "done":
            await manager.send(session_id, {
                "type": "result",
                "session_id": session_id,
                "candidate_id": candidate_id,
                "result": result.model_dump(),
            })

        if file_type != "pdf":
            try:
                os.unlink(file_path)
            except OSError:
                pass

        logger.info("resume_processing_done", file=file_name, stage=result.stage, score=result.score)
        return result


def _state_to_result(state: dict, candidate_id: str, file_name: str) -> CandidateResult:
    evaluation = state.get("evaluation") or {}
    resume = state.get("resume_structured") or {}
    personal = resume.get("personal_info", {}) if isinstance(resume, dict) else {}

    first = personal.get("first_name") or ""
    last = personal.get("last_name") or ""
    name = f"{first} {last}".strip() or None

    stage = state.get("stage", "error")
    if state.get("error") and stage != "done":
        stage = "error"

    return CandidateResult(
        candidate_id=candidate_id,
        file_name=file_name,
        name=name,
        email=personal.get("email"),
        phone=personal.get("phone"),
        score=evaluation.get("fit_score"),
        explanation=evaluation.get("explanation", []),
        stage=stage,
        error=state.get("error"),
        parse_method=state.get("parse_method"),
        screening_outcome=state.get("screening_outcome", "error" if stage == "error" else "ranked"),
        screening_reason=state.get("screening_reason"),
        graduation_year_info=state.get("graduation_year_info") or {},
        preview_available=state.get("file_type") == "pdf" and stage != "skipped",
    )


async def run_pipeline(
    files: list[tuple[str, str, str]],  # [(file_path, file_name, file_type), ...]
    session_id: str,
    jd_dict: dict[str, Any],
    scoring_schema_dict: dict[str, Any],
    graduation_filter_dict: dict[str, Any],
) -> None:
    """
    Process all resumes concurrently (up to MAX_CONCURRENCY at once).
    Updates session state and results store. Sends WebSocket completion event.
    """
    session = _sessions.get(session_id)
    if not session:
        logger.error("session_not_found", session_id=session_id)
        return

    # ── Deduplicate by SHA-256 hash ───────────────────────────────────────────
    seen_hashes: dict[str, str] = {}   # hash → first file_name
    unique_files: list[tuple[str, str, str, str]] = []  # (path, name, type, hash)
    duplicate_results: list[CandidateResult] = []

    for file_path, file_name, file_type in files:
        with open(file_path, "rb") as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()

        if file_hash in seen_hashes:
            original = seen_hashes[file_hash]
            dup_result = CandidateResult(
                candidate_id=str(uuid.uuid4()),
                file_name=file_name,
                stage="skipped",
                error=f"Duplicate of '{original}' — skipped",
                screening_outcome="duplicate",
                screening_reason=f"Duplicate of '{original}' — skipped",
            )
            duplicate_results.append(dup_result)
            try:
                os.unlink(file_path)
            except OSError:
                pass
            logger.warning("duplicate_file_skipped", file=file_name, original=original)
        else:
            seen_hashes[file_hash] = file_name
            unique_files.append((file_path, file_name, file_type, file_hash))

    # Emit skipped duplicates immediately over WebSocket
    for dup in duplicate_results:
        await manager.send(session_id, {
            "type": "result",
            "session_id": session_id,
            "candidate_id": dup.candidate_id,
            "result": dup.model_dump(),
        })

    semaphore = asyncio.Semaphore(settings.MAX_CONCURRENCY)

    tasks = []
    for file_path, file_name, file_type, file_hash in unique_files:
        candidate_id = str(uuid.uuid4())
        task = _process_single_resume(
            file_path, file_name, file_type, session_id, candidate_id,
            jd_dict, scoring_schema_dict, graduation_filter_dict, semaphore, file_hash
        )
        tasks.append(task)

    # Run all resumes with bounded concurrency
    completed_results = await asyncio.gather(*tasks, return_exceptions=True)

    completed = 0
    failed = 0
    skipped = len(duplicate_results)

    # Add duplicate results to the session store
    for dup in duplicate_results:
        _results[session_id].append(dup)

    for res in completed_results:
        if isinstance(res, Exception):
            logger.error("task_exception", session_id=session_id, error=str(res))
            failed += 1
        else:
            _results[session_id].append(res)
            if res.stage == "done":
                completed += 1
            elif res.stage == "skipped":
                skipped += 1
            else:
                failed += 1

    session.completed = completed
    session.failed = failed
    session.status = "done"

    await manager.send(session_id, {
        "type": "complete",
        "session_id": session_id,
        "total": session.total_files,
        "completed": completed,
        "failed": failed,
        "skipped": skipped,
    })

    logger.info(
        "pipeline_complete",
        session_id=session_id,
        total=session.total_files,
        completed=completed,
        failed=failed,
        skipped=skipped,
    )


async def save_upload_to_temp(file_bytes: bytes, suffix: str) -> str:
    """Write uploaded bytes to a temp file and return the path."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=settings.UPLOAD_DIR) as tmp:
        tmp.write(file_bytes)
        return tmp.name
