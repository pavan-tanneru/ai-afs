"""
Generates a JD-specific scoring schema (dimensions + weights) via LLM.
Cached per JD hash — generated only once per unique JD.
"""
from __future__ import annotations

import diskcache
from pydantic import ValidationError

from core.config import get_settings
from core.logging_config import get_logger
from models.schemas import JobDescriptionStructured, ScoringSchema
from agents.llm_client import build_chain, invoke_with_retry

logger = get_logger(__name__)
settings = get_settings()

_schema_cache = diskcache.Cache(settings.CACHE_DIR)
_schema_chain = None


def _get_schema_chain():
    global _schema_chain
    if _schema_chain is None:
        _schema_chain = build_chain("scoring_schema", ScoringSchema)
    return _schema_chain


async def generate_scoring_schema(jd: JobDescriptionStructured, jd_hash: str) -> ScoringSchema:
    """
    Generate a scoring schema for the given JD.
    Returns from cache if the same JD was processed before.
    """
    cache_key = f"schema:{jd_hash}"
    if cache_key in _schema_cache:
        logger.info("schema_cache_hit", jd_hash=jd_hash)
        return ScoringSchema(**_schema_cache[cache_key])

    logger.info("schema_cache_miss_calling_llm", jd_hash=jd_hash)
    chain = _get_schema_chain()

    try:
        raw = await invoke_with_retry(chain, {"jd_json": jd.model_dump_json()})
        schema = ScoringSchema(**raw)
    except ValidationError as e:
        logger.error("schema_validation_error", jd_hash=jd_hash, error=str(e))
        raise
    except Exception as e:
        logger.error("schema_llm_error", jd_hash=jd_hash, error=str(e))
        raise

    _schema_cache[cache_key] = schema.model_dump()
    logger.info("schema_generated_and_cached", jd_hash=jd_hash, dims=len(schema.dimensions))
    return schema
