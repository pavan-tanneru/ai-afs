"""Layout-aware PDF parser using pdfplumber."""
from __future__ import annotations

import io
from dataclasses import dataclass

import pdfplumber
from core.logging_config import get_logger

logger = get_logger(__name__)

MIN_CONFIDENCE_THRESHOLD = 0.5  # ratio of pages with extractable text


@dataclass
class ParseResult:
    text: str
    confidence: float  # 0.0 – 1.0
    method: str = "primary"
    error: str | None = None


def parse_pdf(file_bytes: bytes, file_name: str = "") -> ParseResult:
    """
    Extract text from a PDF using pdfplumber (layout-aware).
    Returns a ParseResult with the extracted text and a confidence score.
    Confidence is the fraction of pages that yielded non-empty text.
    """
    try:
        pages_text: list[str] = []
        non_empty = 0

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            total_pages = len(pdf.pages)
            if total_pages == 0:
                return ParseResult(text="", confidence=0.0, method="primary", error="No pages found")

            for page in pdf.pages:
                try:
                    text = page.extract_text(x_tolerance=2, y_tolerance=2) or ""
                    text = text.strip()
                    pages_text.append(text)
                    if text:
                        non_empty += 1
                except Exception as e:
                    logger.warning("pdf_page_extract_error", file=file_name, error=str(e))
                    pages_text.append("")

        full_text = "\n\n".join(t for t in pages_text if t)
        confidence = non_empty / total_pages if total_pages > 0 else 0.0

        logger.info(
            "pdf_parsed",
            file=file_name,
            pages=total_pages,
            non_empty=non_empty,
            confidence=round(confidence, 2),
            chars=len(full_text),
        )
        return ParseResult(text=full_text, confidence=confidence, method="primary")

    except Exception as e:
        logger.error("pdf_parse_failed", file=file_name, error=str(e))
        return ParseResult(text="", confidence=0.0, method="primary", error=str(e))
