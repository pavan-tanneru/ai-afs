"""GET /api/export/{session_id} — Download ranked results as .xlsx."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.export.excel import generate_excel
from app.pipeline.orchestrator import get_results, get_session
from app.core.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/{session_id}")
async def export_excel(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    results = get_results(session_id)
    if not results:
        raise HTTPException(status_code=404, detail="No results available for export")

    try:
        xlsx_bytes = generate_excel(results)
    except Exception as e:
        logger.error("excel_export_error", session_id=session_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="ai_afs_{session_id[:8]}.xlsx"'
        },
    )
