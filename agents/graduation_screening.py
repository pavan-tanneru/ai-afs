from __future__ import annotations

import re
from typing import Any

from models.schemas import CandidateGraduationYearInfo, GraduationYearFilterConfig


_YEAR_RE = re.compile(r"(19|20)\d{2}")
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_FIELD_STOPWORDS = {
    "and", "of", "in", "for", "the", "with", "science", "engineering", "studies",
}

_DEGREE_RULES: list[tuple[re.Pattern[str], str, str, int | None]] = [
    (re.compile(r"\b(ph\.?d|doctor of philosophy|doctorate)\b", re.I), "PhD", "doctorate", None),
    (
        re.compile(
            r"\b(integrated|dual degree|bs[-\s]?ms|b\.?tech.*m\.?tech|b\.?e.*m\.?e|bachelor.*master)\b",
            re.I,
        ),
        "Integrated Degree",
        "master",
        5,
    ),
    (
        re.compile(
            r"\b(m\.?tech|master of technology|m\.?e\b|master of engineering|m\.?sc|master of science|"
            r"mca|mba|master of business administration|m\.?com|master of commerce|ma\b|master of arts)\b",
            re.I,
        ),
        "Master's",
        "master",
        2,
    ),
    (
        re.compile(r"\b(b\.?tech|bachelor of technology|b\.?e\b|bachelor of engineering)\b", re.I),
        "Bachelor's",
        "bachelor",
        4,
    ),
    (
        re.compile(
            r"\b(b\.?sc|bachelor of science|bca|bachelor of computer applications|b\.?a\b|"
            r"bachelor of arts|b\.?com|bachelor of commerce)\b",
            re.I,
        ),
        "Bachelor's",
        "bachelor",
        3,
    ),
]

_LEVEL_RANK = {
    "doctorate": 4,
    "master": 3,
    "bachelor": 2,
    "associate": 1,
    "other": 0,
}


def evaluate_graduation_year_filter(
    jd_structured: dict[str, Any],
    resume_structured: dict[str, Any],
    config_dict: dict[str, Any] | None,
) -> dict[str, Any]:
    config = GraduationYearFilterConfig(**(config_dict or {}))
    if not config.enabled or not config.accepted_years:
        return {
            "stage": "evaluating",
            "screening_outcome": "ranked",
            "screening_reason": None,
            "graduation_year_info": CandidateGraduationYearInfo(source="not_applicable").model_dump(),
        }

    graduation_year_info = _resolve_candidate_graduation_year(
        resume_structured=resume_structured,
        jd_structured=jd_structured,
    )
    graduation_year = graduation_year_info.graduation_year

    if graduation_year is None:
        selected_degree = graduation_year_info.selected_degree or "education history"
        return {
            "stage": "review",
            "screening_outcome": "review",
            "screening_reason": f"Graduation year could not be determined for {selected_degree}.",
            "graduation_year_info": graduation_year_info.model_dump(),
        }

    accepted_years = sorted(set(config.accepted_years))
    if graduation_year in accepted_years:
        return {
            "stage": "evaluating",
            "screening_outcome": "ranked",
            "screening_reason": None,
            "graduation_year_info": graduation_year_info.model_dump(),
        }

    accepted = ", ".join(str(year) for year in accepted_years)
    return {
        "stage": "filtered",
        "screening_outcome": "filtered",
        "screening_reason": f"Graduation year {graduation_year} is outside accepted years ({accepted}).",
        "graduation_year_info": graduation_year_info.model_dump(),
    }


def _resolve_candidate_graduation_year(
    resume_structured: dict[str, Any],
    jd_structured: dict[str, Any],
) -> CandidateGraduationYearInfo:
    education_entries = resume_structured.get("education") or []
    if not education_entries:
        return CandidateGraduationYearInfo(source="unknown")

    jd_field = ((jd_structured.get("education_requirements") or {}).get("field") or "").strip()
    analyzed_entries = [_analyze_education_entry(entry, jd_field) for entry in education_entries]
    valid_entries = [entry for entry in analyzed_entries if entry["selected_degree"]]

    if not valid_entries:
        return CandidateGraduationYearInfo(source="unknown")

    field_matches = [entry for entry in valid_entries if entry["field_match"]]
    candidate_entries = field_matches or valid_entries
    chosen = max(candidate_entries, key=_entry_sort_key)

    return CandidateGraduationYearInfo(
        selected_degree=chosen["selected_degree"],
        graduation_year=chosen["graduation_year"],
        source=chosen["source"],
    )


def _analyze_education_entry(entry: dict[str, Any], jd_field: str) -> dict[str, Any]:
    degree = (entry.get("degree") or "").strip()
    field = (entry.get("field") or "").strip()
    institution = (entry.get("institution") or "").strip()
    selected_degree = _format_selected_degree(degree, field, institution)

    normalized_degree = f"{degree} {field}".strip()
    family, level, duration_years = _classify_degree(normalized_degree)
    start_year = _extract_year(entry.get("start_date"))
    end_raw = (entry.get("end_date") or "").strip()
    explicit_end_year = _extract_year(end_raw) if end_raw.lower() != "present" else None

    source = "unknown"
    graduation_year = None
    if explicit_end_year is not None:
        graduation_year = explicit_end_year
        source = "explicit"
    elif end_raw.lower() == "present" and start_year is not None and duration_years is not None:
        graduation_year = start_year + duration_years
        source = "inferred"

    return {
        "selected_degree": selected_degree,
        "degree_family": family,
        "level": level,
        "level_rank": _LEVEL_RANK.get(level, 0),
        "graduation_year": graduation_year,
        "source": source,
        "field_match": _field_matches(jd_field, field or degree),
    }


def _classify_degree(text: str) -> tuple[str | None, str, int | None]:
    lowered = text.lower()
    for pattern, family, level, duration_years in _DEGREE_RULES:
        if pattern.search(lowered):
            return family, level, duration_years
    return None, "other", None


def _extract_year(value: Any) -> int | None:
    if not value:
        return None
    match = _YEAR_RE.search(str(value))
    if not match:
        return None
    return int(match.group(0))


def _field_matches(jd_field: str, candidate_text: str) -> bool:
    if not jd_field:
        return False
    jd_tokens = _meaningful_tokens(jd_field)
    candidate_tokens = _meaningful_tokens(candidate_text)
    return bool(jd_tokens and candidate_tokens and jd_tokens.intersection(candidate_tokens))


def _meaningful_tokens(value: str) -> set[str]:
    tokens = {token for token in _TOKEN_RE.findall(value.lower()) if len(token) > 2}
    return {token for token in tokens if token not in _FIELD_STOPWORDS}


def _format_selected_degree(degree: str, field: str, institution: str) -> str | None:
    if degree and field:
        return f"{degree} in {field}"
    if degree:
        return degree
    if field:
        return field
    if institution:
        return institution
    return None


def _entry_sort_key(entry: dict[str, Any]) -> tuple[int, int, int]:
    has_known_year = 1 if entry["graduation_year"] is not None else 0
    graduation_year = entry["graduation_year"] or 0
    return entry["level_rank"], has_known_year, graduation_year
