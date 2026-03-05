"""OCR fallback parser for low-confidence PDFs using pytesseract + pdf2image."""
from __future__ import annotations

import io
from dataclasses import dataclass

from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class ParseResult:
    text: str
    confidence: float
    method: str = "ocr"
    error: str | None = None


def parse_with_ocr(file_bytes: bytes, file_name: str = "") -> ParseResult:
    """
    Convert PDF pages to images and run Tesseract OCR.
    Used as fallback when primary PDF parsing confidence is too low.
    """
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
        from PIL import Image

        images = convert_from_bytes(file_bytes, dpi=200)
        if not images:
            return ParseResult(text="", confidence=0.0, method="ocr", error="No images converted")

        pages_text: list[str] = []
        for i, img in enumerate(images):
            try:
                text = pytesseract.image_to_string(img, lang="eng", config="--psm 1")
                text = text.strip()
                if text:
                    pages_text.append(text)
            except Exception as e:
                logger.warning("ocr_page_error", file=file_name, page=i, error=str(e))

        full_text = "\n\n".join(pages_text)
        confidence = len(pages_text) / len(images) if images else 0.0

        logger.info(
            "ocr_completed",
            file=file_name,
            pages=len(images),
            extracted=len(pages_text),
            confidence=round(confidence, 2),
            chars=len(full_text),
        )
        return ParseResult(text=full_text, confidence=confidence, method="ocr")

    except ImportError as e:
        logger.error("ocr_import_error", error=str(e))
        return ParseResult(text="", confidence=0.0, method="ocr", error=f"OCR unavailable: {e}")
    except Exception as e:
        logger.error("ocr_failed", file=file_name, error=str(e))
        return ParseResult(text="", confidence=0.0, method="ocr", error=str(e))
