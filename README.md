# AI AFS — AI-Powered Resume Filtering & Candidate Ranking System

An open-source tool that automates resume screening using LLMs. Upload a job description and a batch of resumes (PDF/DOCX) — the system extracts, evaluates, and ranks candidates in real-time, then exports the results to Excel.

## Features

- **Automated JD parsing** — extracts required skills, experience, and role details from any job description
- **Dynamic scoring schema** — LLM generates a role-specific rubric (3–6 dimensions, weights summing to 100) tailored to the seniority level and role type
- **Editable rubric** — review and customise dimension labels, descriptions, and weights before processing; add or remove dimensions freely
- **Per-dimension evaluation** — each resume is scored independently on every dimension; the final score is assembled in Python from bounded dimension scores, not a holistic LLM guess
- **Batch resume processing** — handles PDF and DOCX files with OCR fallback for scanned documents
- **Real-time progress** — live WebSocket updates as each resume is processed
- **Sortable results table** — filter and rank candidates interactively in the UI
- **Excel export** — one-click download of ranked results
- **Caching** — JD parsing and scoring schema generation are cached to avoid redundant LLM calls
- **Docker-first** — single `docker-compose up` to run everything

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python 3.12 |
| LLM Orchestration | LangChain, LangGraph |
| LLM Provider | xAI Grok (OpenAI-compatible API) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Resume Parsing | pdfplumber, python-docx, pytesseract (OCR) |
| Export | openpyxl |
| Caching | diskcache |
| Infrastructure | Docker, Docker Compose, Nginx |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Frontend (React)                   │
│  Step 1: JD Input + Schema Review/Edit               │
│  Step 2: Upload → Step 3: Processing → Step 4: Results│
└─────────────────────┬────────────────────────────────┘
                      │ HTTP + WebSocket
┌─────────────────────▼────────────────────────────────┐
│                   FastAPI Backend                     │
│                                                       │
│  POST /api/jobs/parse   (JD parse + schema, cached)  │
│  POST /api/resumes/process  (start pipeline)          │
│  GET  /api/resumes/results/{session_id}               │
│  GET  /api/export/{session_id}  (Excel download)      │
│  WS   /ws/{session_id}  (live progress)               │
│                                                       │
│  LangGraph Pipeline per resume:                       │
│    parse_file → llm_extract → evaluate                │
│                    ↑                                  │
│    evaluate uses per-dimension scoring schema         │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- An [xAI API key](https://x.ai/api) (or any OpenAI-compatible LLM provider)

### 1. Clone the repo

```bash
git clone https://github.com/pavan-tanneru/ai-afs.git
cd ai-afs
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set your API key:

```env
XAI_API_KEY=your_xai_api_key_here
```

### 3. Run

```bash
docker-compose up --build
```

The app will be available at `http://localhost`.

The backend API is at `http://localhost:8000` and the interactive docs at `http://localhost:8000/docs`.

## Configuration

All configuration is done via the `.env` file:

| Variable | Default | Description |
|---|---|---|
| `XAI_API_KEY` | *(required)* | Your xAI / Grok API key |
| `XAI_BASE_URL` | `https://api.x.ai/v1` | LLM API base URL (OpenAI-compatible) |
| `MODEL_NAME` | `grok-4-1` | Model to use for evaluation |
| `MAX_CONCURRENCY` | `5` | Max resumes processed in parallel |
| `MAX_LLM_RETRIES` | `3` | Retry attempts on LLM failure |
| `CACHE_DIR` | `./cache` | Directory for JD parsing cache |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded resumes |
| `LOG_LEVEL` | `INFO` | Logging verbosity |

### Using a different LLM provider

The backend uses LangChain's OpenAI-compatible client, so you can point it at any compatible API (OpenAI, Azure OpenAI, Groq, Together AI, etc.) by changing `XAI_BASE_URL` and `MODEL_NAME`.

```env
# Example: OpenAI
XAI_API_KEY=sk-...
XAI_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o
```

## Development Setup (without Docker)

### Backend

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Install system dependencies for OCR (optional)
# macOS:   brew install tesseract poppler
# Ubuntu:  apt install tesseract-ocr poppler-utils

cp .env.example .env  # edit with your API key
uvicorn server.main:app --reload --port 8000
```

### Frontend

```bash
cd ui
npm install
npm run dev  # runs on http://localhost:5173
```

## Project Structure

```
ai-afs/
├── agents/           # AI agents and LangGraph pipeline
│   ├── jd_agent.py              # JD parsing (cached LLM call)
│   ├── scoring_schema_agent.py  # Scoring schema generation (cached)
│   ├── resume_agent.py          # LangGraph StateGraph per resume
│   ├── llm_client.py            # LangChain chain builder + retry
│   └── orchestrator.py          # Session + concurrency management
├── tools/            # Document processing tools
│   ├── pdf_tool.py       # pdfplumber-based PDF parser
│   ├── ocr_tool.py       # pytesseract OCR fallback
│   └── docx_tool.py      # python-docx parser
├── prompts/          # YAML prompt templates
│   ├── jd_parsing.yaml
│   ├── resume_parsing.yaml
│   ├── scoring_schema.yaml   # Rubric generation prompt
│   └── evaluation.yaml       # Per-dimension scoring prompt
├── models/           # Pydantic schemas
│   └── schemas.py
├── server/           # Thin HTTP/WS layer
│   ├── main.py           # FastAPI app entry point
│   ├── routes/           # REST endpoints (jobs, resumes, export)
│   ├── ws/               # WebSocket connection manager
│   └── export/           # Excel generation
├── core/             # Config + logging
│   ├── config.py
│   └── logging_config.py
├── ui/               # React frontend
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/       # React components
│   │   └── types/            # TypeScript types
│   ├── Dockerfile
│   └── nginx.conf
├── Dockerfile
├── requirements.txt
├── docker-compose.yml
├── .env.example
└── .gitignore
```

## How It Works

1. **JD Parsing** — The job description is sent to the LLM which extracts structured data (role title, required skills, experience level, etc.). Results are cached by content hash.

2. **Scoring Schema Generation** — Immediately after JD parsing, a second LLM call generates a role-appropriate scoring rubric: 3–6 dimensions with `max_points` values summing to 100. Weights are adapted to role type — intern JDs weight education/projects highly, senior roles weight experience and leadership. The schema is also cached per JD.

3. **Schema Review & Edit** — The rubric is shown in the UI before any resumes are uploaded. Users can edit dimension labels, descriptions, and point weights; add new dimensions; or remove existing ones. The "Proceed" button is only enabled when weights sum to exactly 100. If the schema is edited, the user's version is sent to the backend and used instead of the cached one.

4. **Resume Upload** — Files are uploaded and a processing session is created. The backend starts the LangGraph pipeline for each file concurrently (up to `MAX_CONCURRENCY`).

5. **LangGraph Pipeline** — Each resume goes through three nodes:
   - `parse_file` — extracts raw text from PDF/DOCX (with OCR fallback for scanned PDFs)
   - `llm_extract` — sends text to the LLM to extract structured candidate details
   - `evaluate` — scores the candidate on each schema dimension independently (LLM assigns 0..max_points per dimension with a one-sentence reason); Python assembles the final score by summing clamped dimension scores

6. **Real-time Updates** — The frontend subscribes via WebSocket and receives a progress event after each resume completes.

7. **Results & Export** — Candidates are displayed in a sortable table ranked by score. The top-3 highest-weighted dimension reasons are shown as explanation bullets. Results can be exported as an Excel file.

## Contributing

Contributions are welcome. Please open an issue first to discuss significant changes.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
