from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


# ─── Job Description Schema ────────────────────────────────────────────────────

class EducationRequirement(BaseModel):
    level: Optional[str] = None
    field: Optional[str] = None
    required: Optional[bool] = False


class JobDescriptionStructured(BaseModel):
    role_title: str
    seniority_level: Optional[str] = None
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    min_years_experience: Optional[int] = None
    preferred_years_experience: Optional[int] = None
    education_requirements: Optional[EducationRequirement] = None
    responsibilities: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    weighting_signals: dict[str, float] = Field(default_factory=dict)


class GraduationYearFilterConfig(BaseModel):
    enabled: bool = False
    accepted_years: list[int] = Field(default_factory=list)
    unknown_year_behavior: Literal["manual_review"] = "manual_review"
    degree_selection: Literal["highest_relevant_degree"] = "highest_relevant_degree"


# ─── Resume Schema ─────────────────────────────────────────────────────────────

class PersonalInfo(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None


class EducationEntry(BaseModel):
    institution: Optional[str] = None
    degree: Optional[str] = None
    field: Optional[str] = None
    score_gpa: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class WorkExperienceEntry(BaseModel):
    organization: Optional[str] = None
    role: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    responsibilities: list[str] = Field(default_factory=list)


class Project(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    technologies: list[str] = Field(default_factory=list)


class Publication(BaseModel):
    title: Optional[str] = None
    journal: Optional[str] = None
    year: Optional[str] = None


class Certification(BaseModel):
    name: Optional[str] = None
    issuer: Optional[str] = None
    date: Optional[str] = None


class ResumeStructured(BaseModel):
    personal_info: PersonalInfo = Field(default_factory=PersonalInfo)
    skills: list[str] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)
    work_experience: list[WorkExperienceEntry] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    publications: list[Publication] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)
    additional_info: dict[str, Any] = Field(default_factory=dict)


class CandidateGraduationYearInfo(BaseModel):
    selected_degree: Optional[str] = None
    graduation_year: Optional[int] = None
    source: Literal["explicit", "inferred", "unknown", "not_applicable"] = "not_applicable"


# ─── Scoring Schema ────────────────────────────────────────────────────────────

class ScoringDimension(BaseModel):
    name: str
    label: str
    description: str
    max_points: int


class ScoringSchema(BaseModel):
    dimensions: list[ScoringDimension]


class DimensionScore(BaseModel):
    name: str
    score: int
    reason: str


class DimensionEvaluation(BaseModel):
    scores: list[DimensionScore]


# ─── Evaluation Schema ─────────────────────────────────────────────────────────

class EvaluationResult(BaseModel):
    fit_score: int = Field(..., ge=0, le=100)
    explanation: list[str] = Field(..., min_length=3, max_length=3)


# ─── Session / Pipeline State ──────────────────────────────────────────────────

class CandidateResult(BaseModel):
    candidate_id: str
    file_name: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    score: Optional[int] = None
    explanation: list[str] = Field(default_factory=list)
    stage: str = "queued"  # queued | parsing | extracting | screening | evaluating | done | error | skipped | filtered | review
    error: Optional[str] = None
    parse_method: Optional[str] = None  # primary | ocr
    screening_outcome: Literal["ranked", "filtered", "review", "duplicate", "error"] = "ranked"
    screening_reason: Optional[str] = None
    graduation_year_info: CandidateGraduationYearInfo = Field(default_factory=CandidateGraduationYearInfo)
    preview_available: bool = False


class SessionInfo(BaseModel):
    session_id: str
    jd_hash: str
    total_files: int
    completed: int = 0
    failed: int = 0
    status: str = "processing"  # processing | done


# ─── API Request/Response Models ──────────────────────────────────────────────

class ParseJDRequest(BaseModel):
    jd_text: str


class ParseJDResponse(BaseModel):
    jd_id: str
    structured: JobDescriptionStructured
    scoring_schema: ScoringSchema


class StartProcessingResponse(BaseModel):
    session_id: str
    total_files: int
    message: str


# ─── WebSocket Message Types ───────────────────────────────────────────────────

class WSProgressMessage(BaseModel):
    type: str = "progress"
    session_id: str
    candidate_id: str
    stage: str
    message: str
    data: Optional[dict[str, Any]] = None


class WSResultMessage(BaseModel):
    type: str = "result"
    session_id: str
    candidate_id: str
    result: dict[str, Any]


class WSCompleteMessage(BaseModel):
    type: str = "complete"
    session_id: str
    total: int
    completed: int
    failed: int
