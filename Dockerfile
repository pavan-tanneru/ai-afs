# ── Stage 1: base dependencies ────────────────────────────────────────────────
FROM python:3.12-slim AS base

# System packages for OCR + PDF → image conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: app ──────────────────────────────────────────────────────────────
FROM base AS app

COPY agents/ ./agents/
COPY tools/ ./tools/
COPY models/ ./models/
COPY server/ ./server/
COPY core/ ./core/
COPY prompts/ ./prompts/

# Create runtime directories
RUN mkdir -p cache uploads

EXPOSE 8000

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
