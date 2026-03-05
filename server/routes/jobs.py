"""POST /api/jobs/parse — Step 1: Parse a job description (cached)."""
from fastapi import APIRouter, HTTPException
from models.schemas import ParseJDRequest, ParseJDResponse
from agents.jd_agent import parse_job_description
from core.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/parse", response_model=ParseJDResponse)
async def parse_jd(body: ParseJDRequest):
    if not body.jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text cannot be empty")

    try:
        jd_id, structured = await parse_job_description(body.jd_text)
        return ParseJDResponse(jd_id=jd_id, structured=structured)
    except Exception as e:
        logger.error("parse_jd_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"JD parsing failed: {e}")
