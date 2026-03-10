"""
STEP 2 + STEP 3 — Resume Processing LangGraph Pipeline (PER RESUME)

Graph: START → parse_file → llm_extract → evaluate → END
       Error edges skip remaining nodes and land on END.

Progress events are sent to the WebSocket manager at each stage transition.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

import diskcache
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict
from pydantic import ValidationError

from core.config import get_settings
from core.logging_config import get_logger
from models.schemas import ResumeStructured, EvaluationResult, DimensionEvaluation
from tools.pdf_tool import parse_pdf
from tools.docx_tool import parse_docx
from tools.ocr_tool import parse_with_ocr
from agents.llm_client import build_chain, invoke_with_retry
from agents.graduation_screening import evaluate_graduation_year_filter
from server.ws.manager import manager

logger = get_logger(__name__)
_settings = get_settings()

OCR_CONFIDENCE_THRESHOLD = 0.5  # trigger OCR when primary confidence < this

# Evaluation result cache — keyed by (file_hash, jd_hash)
_eval_cache = diskcache.Cache(_settings.CACHE_DIR)

# ─── Lazy chain builders ───────────────────────────────────────────────────────
_resume_chain = None
_eval_chain = None


def _get_resume_chain():
    global _resume_chain
    if _resume_chain is None:
        _resume_chain = build_chain("resume_parsing", ResumeStructured)
    return _resume_chain


def _get_eval_chain():
    global _eval_chain
    if _eval_chain is None:
        _eval_chain = build_chain("evaluation", DimensionEvaluation)
    return _eval_chain


# ─── LangGraph State ──────────────────────────────────────────────────────────

class ResumeState(TypedDict):
    # ── Inputs ──
    file_name: str
    file_path: str          # path to temp file on disk
    file_type: str          # "pdf" | "docx"
    file_hash: str          # SHA-256 of raw file bytes
    session_id: str
    candidate_id: str
    jd_structured: dict     # JobDescriptionStructured.model_dump()
    scoring_schema: dict    # ScoringSchema.model_dump()
    graduation_filter: dict

    # ── Parsing stage ──
    raw_text: Optional[str]
    parse_method: str       # "primary" | "ocr" | "failed"
    parse_confidence: float
    parse_error: Optional[str]

    # ── LLM extraction stage ──
    resume_structured: Optional[dict]
    llm_error: Optional[str]

    # ── Screening stage ──
    screening_reason: Optional[str]
    screening_outcome: str
    graduation_year_info: Optional[dict]

    # ── Evaluation stage ──
    evaluation: Optional[dict]
    eval_error: Optional[str]

    # ── Final ──
    stage: str              # queued|parsing|extracting|screening|evaluating|done|error|skipped|filtered|review
    error: Optional[str]


# ─── Helper ───────────────────────────────────────────────────────────────────

async def _emit(session_id: str, candidate_id: str, stage: str, message: str, data: dict | None = None):
    await manager.send(session_id, {
        "type": "progress",
        "session_id": session_id,
        "candidate_id": candidate_id,
        "stage": stage,
        "message": message,
        "data": data or {},
    })


# ─── Graph Nodes ──────────────────────────────────────────────────────────────

async def parse_file_node(state: ResumeState) -> dict[str, Any]:
    """STEP 2a: Read file bytes and extract raw text."""
    await _emit(state["session_id"], state["candidate_id"], "parsing",
                f"Parsing {state['file_name']}…")

    try:
        with open(state["file_path"], "rb") as f:
            file_bytes = f.read()
    except OSError as e:
        logger.error("file_read_error", file=state["file_name"], error=str(e))
        return {
            "raw_text": None,
            "parse_method": "failed",
            "parse_confidence": 0.0,
            "parse_error": f"Cannot read file: {e}",
            "stage": "error",
            "error": f"File read error: {e}",
        }

    if state["file_type"] == "pdf":
        result = parse_pdf(file_bytes, state["file_name"])
        if result.confidence < OCR_CONFIDENCE_THRESHOLD and not result.error:
            logger.info("low_confidence_falling_back_to_ocr",
                        file=state["file_name"], confidence=result.confidence)
            await _emit(state["session_id"], state["candidate_id"], "parsing",
                        f"Low confidence ({result.confidence:.0%}) — running OCR…")
            result = parse_with_ocr(file_bytes, state["file_name"])
    elif state["file_type"] == "docx":
        result = parse_docx(file_bytes, state["file_name"])
    else:
        return {
            "raw_text": None,
            "parse_method": "failed",
            "parse_confidence": 0.0,
            "parse_error": f"Unsupported file type: {state['file_type']}",
            "stage": "error",
            "error": f"Unsupported file type: {state['file_type']}",
        }

    if result.error or not result.text.strip():
        return {
            "raw_text": None,
            "parse_method": "failed",
            "parse_confidence": 0.0,
            "parse_error": result.error or "Empty text extracted",
            "stage": "error",
            "error": result.error or "No text could be extracted from file",
        }

    return {
        "raw_text": result.text,
        "parse_method": result.method,
        "parse_confidence": result.confidence,
        "parse_error": None,
        "stage": "extracting",
    }


async def llm_extract_node(state: ResumeState) -> dict[str, Any]:
    """STEP 2b: Send parsed text to LLM → structured ResumeJSON."""
    await _emit(state["session_id"], state["candidate_id"], "extracting",
                "Extracting structured data via LLM…")

    chain = _get_resume_chain()
    try:
        raw = await invoke_with_retry(chain, {"resume_text": state["raw_text"]})
        structured = ResumeStructured(**raw)
        return {
            "resume_structured": structured.model_dump(),
            "llm_error": None,
            "stage": "screening",
        }
    except ValidationError as e:
        logger.error("resume_validation_error", file=state["file_name"], error=str(e))
        return {
            "resume_structured": None,
            "llm_error": f"Validation error: {e}",
            "stage": "error",
            "error": f"Resume extraction validation failed: {e}",
        }
    except Exception as e:
        logger.error("resume_llm_error", file=state["file_name"], error=str(e))
        return {
            "resume_structured": None,
            "llm_error": str(e),
            "stage": "error",
            "error": f"LLM extraction failed: {e}",
        }


async def screen_candidate_node(state: ResumeState) -> dict[str, Any]:
    """STEP 2c: Apply optional graduation-year screening before evaluation."""
    await _emit(
        state["session_id"],
        state["candidate_id"],
        "screening",
        "Applying graduation-year screening…",
    )

    screening = evaluate_graduation_year_filter(
        jd_structured=state["jd_structured"],
        resume_structured=state["resume_structured"] or {},
        config_dict=state.get("graduation_filter"),
    )

    return {
        "screening_reason": screening["screening_reason"],
        "screening_outcome": screening["screening_outcome"],
        "graduation_year_info": screening["graduation_year_info"],
        "stage": screening["stage"],
        "error": None,
    }


async def evaluate_node(state: ResumeState) -> dict[str, Any]:
    """STEP 3: Evaluate candidate fit against JD using per-dimension scoring."""
    await _emit(state["session_id"], state["candidate_id"], "evaluating",
                "Evaluating candidate fit…")

    # Build cache key from file content hash + JD content hash
    jd_hash = hashlib.sha256(
        json.dumps(state["jd_structured"], sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    cache_key = f"eval:{state['file_hash']}:{jd_hash}"

    chain = _get_eval_chain()
    try:
        # ── Cache hit: return persisted evaluation ────────────────────────────
        if state.get("file_hash") and cache_key in _eval_cache:
            cached_eval = _eval_cache[cache_key]
            logger.info("eval_cache_hit", file=state["file_name"])
            evaluation = EvaluationResult(**cached_eval)
        else:
            jd_json = json.dumps(state["jd_structured"], ensure_ascii=False)
            resume_json = json.dumps(state["resume_structured"], ensure_ascii=False)
            scoring_schema_json = json.dumps(state["scoring_schema"], ensure_ascii=False)

            raw = await invoke_with_retry(chain, {
                "jd_json": jd_json,
                "resume_json": resume_json,
                "scoring_schema_json": scoring_schema_json,
            })
            dim_eval = DimensionEvaluation(**raw)

            # ── Assemble score from dimensions (pure Python) ──────────────────
            schema_dims = {
                d["name"]: d["max_points"]
                for d in state["scoring_schema"]["dimensions"]
            }
            fit_score = max(0, min(100, round(
                sum(
                    max(0, min(schema_dims.get(ds.name, 0), ds.score))
                    for ds in dim_eval.scores
                )
            )))

            # Top 3 bullets: from dimensions with highest max_points
            top3_names = sorted(schema_dims, key=schema_dims.get, reverse=True)[:3]
            score_map = {ds.name: ds.reason for ds in dim_eval.scores}
            explanation = [score_map.get(n, "No evaluation available.") for n in top3_names]

            evaluation = EvaluationResult(fit_score=fit_score, explanation=explanation)

            # Persist result for future uploads of the same resume+JD pair
            if state.get("file_hash"):
                _eval_cache[cache_key] = evaluation.model_dump()

        # Extract candidate name for the result
        personal = state["resume_structured"].get("personal_info", {})
        first = personal.get("first_name") or ""
        last = personal.get("last_name") or ""
        name = f"{first} {last}".strip() or None

        result_data = {
            "candidate_id": state["candidate_id"],
            "file_name": state["file_name"],
            "name": name,
            "email": personal.get("email"),
            "phone": personal.get("phone"),
            "score": evaluation.fit_score,
            "explanation": evaluation.explanation,
            "stage": "done",
            "parse_method": state["parse_method"],
            "error": None,
            "screening_outcome": state.get("screening_outcome", "ranked"),
            "screening_reason": state.get("screening_reason"),
            "graduation_year_info": state.get("graduation_year_info"),
            "preview_available": state.get("file_type") == "pdf",
        }

        # Emit final result
        await manager.send(state["session_id"], {
            "type": "result",
            "session_id": state["session_id"],
            "candidate_id": state["candidate_id"],
            "result": result_data,
        })

        return {
            "evaluation": evaluation.model_dump(),
            "eval_error": None,
            "stage": "done",
            "error": None,
        }
    except ValidationError as e:
        logger.error("eval_validation_error", file=state["file_name"], error=str(e))
        return {
            "evaluation": None,
            "eval_error": str(e),
            "stage": "error",
            "error": f"Evaluation validation failed: {e}",
        }
    except Exception as e:
        logger.error("eval_llm_error", file=state["file_name"], error=str(e))
        return {
            "evaluation": None,
            "eval_error": str(e),
            "stage": "error",
            "error": f"Evaluation failed: {e}",
        }


# ─── Conditional routing ──────────────────────────────────────────────────────

def route_after_parse(state: ResumeState) -> str:
    if state.get("parse_method") == "failed" or state.get("stage") == "error":
        return "end_error"
    return "llm_extract"


def route_after_extract(state: ResumeState) -> str:
    if state.get("stage") == "error" or state.get("resume_structured") is None:
        return "end_error"
    return "screen_candidate"


def route_after_screen(state: ResumeState) -> str:
    if state.get("stage") == "evaluating":
        return "evaluate"
    return "end_final"


# ─── Graph compilation ────────────────────────────────────────────────────────

def build_resume_graph():
    builder = StateGraph(ResumeState)

    builder.add_node("parse_file", parse_file_node)
    builder.add_node("llm_extract", llm_extract_node)
    builder.add_node("screen_candidate", screen_candidate_node)
    builder.add_node("evaluate", evaluate_node)

    builder.add_edge(START, "parse_file")
    builder.add_conditional_edges(
        "parse_file",
        route_after_parse,
        {"llm_extract": "llm_extract", "end_error": END},
    )
    builder.add_conditional_edges(
        "llm_extract",
        route_after_extract,
        {"screen_candidate": "screen_candidate", "end_error": END},
    )
    builder.add_conditional_edges(
        "screen_candidate",
        route_after_screen,
        {"evaluate": "evaluate", "end_final": END},
    )
    builder.add_edge("evaluate", END)

    return builder.compile()


# Compiled once, reused for all resumes
resume_graph = build_resume_graph()
