"""
STEP 1 — Job Description → Structured JSON (ONE-TIME LLM CALL)
The result is persisted in a disk cache keyed by SHA-256 of the JD text.
Subsequent calls with the same JD return immediately from cache.
"""
from __future__ import annotations

import hashlib
import json

import diskcache
from pydantic import ValidationError

from core.config import get_settings
from core.logging_config import get_logger
from models.schemas import JobDescriptionStructured
from agents.llm_client import build_chain, invoke_with_retry

logger = get_logger(__name__)
settings = get_settings()

_cache = diskcache.Cache(settings.CACHE_DIR)
_jd_chain = None  # lazy-init


def _get_jd_chain():
    global _jd_chain
    if _jd_chain is None:
        _jd_chain = build_chain("jd_parsing", JobDescriptionStructured)
    return _jd_chain


def _hash_jd(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


async def parse_job_description(jd_text: str) -> tuple[str, JobDescriptionStructured]:
    """
    Parse a job description into structured JSON.

    Returns:
        (jd_id, JobDescriptionStructured) where jd_id is the SHA-256 hash used as cache key.

    The LLM is called ONLY when the JD has not been seen before.
    """
    jd_id = _hash_jd(jd_text)

    # ── Cache hit ──────────────────────────────────────────────────────────────
    if jd_id in _cache:
        logger.info("jd_cache_hit", jd_id=jd_id)
        cached_dict = _cache[jd_id]
        return jd_id, JobDescriptionStructured(**cached_dict)

    # ── Cache miss → LLM call ─────────────────────────────────────────────────
    logger.info("jd_cache_miss_calling_llm", jd_id=jd_id, chars=len(jd_text))
    chain = _get_jd_chain()

    try:
        raw_output = await invoke_with_retry(chain, {"job_description": jd_text})
        structured = JobDescriptionStructured(**raw_output)
    except ValidationError as e:
        logger.error("jd_validation_error", jd_id=jd_id, error=str(e))
        raise
    except Exception as e:
        logger.error("jd_llm_error", jd_id=jd_id, error=str(e))
        raise

    # ── Persist to cache ───────────────────────────────────────────────────────
    _cache[jd_id] = structured.model_dump()
    logger.info("jd_parsed_and_cached", jd_id=jd_id, role=structured.role_title)

    return jd_id, structured
