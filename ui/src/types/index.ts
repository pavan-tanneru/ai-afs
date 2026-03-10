export type Stage =
  | 'queued'
  | 'parsing'
  | 'extracting'
  | 'screening'
  | 'evaluating'
  | 'done'
  | 'error'
  | 'skipped'
  | 'filtered'
  | 'review'

export type ScreeningOutcome =
  | 'ranked'
  | 'filtered'
  | 'review'
  | 'duplicate'
  | 'error'

export interface GraduationYearInfo {
  selected_degree?: string
  graduation_year?: number
  source: 'explicit' | 'inferred' | 'unknown' | 'not_applicable'
}

export interface GraduationYearFilterConfig {
  enabled: boolean
  accepted_years: number[]
  unknown_year_behavior: 'manual_review'
  degree_selection: 'highest_relevant_degree'
}

export interface CandidateProgress {
  candidateId: string
  fileName: string
  name?: string
  email?: string
  phone?: string
  score?: number
  explanation?: string[]
  stage: Stage
  error?: string
  parseMethod?: string
  screeningOutcome: ScreeningOutcome
  screeningReason?: string
  graduationYearInfo: GraduationYearInfo
  previewAvailable: boolean
}

export interface WSProgressMsg {
  type: 'progress'
  session_id: string
  candidate_id: string
  stage: Stage
  message: string
  data?: Record<string, unknown>
}

export interface WSResultMsg {
  type: 'result'
  session_id: string
  candidate_id: string
  result: {
    candidate_id: string
    file_name: string
    name?: string
    email?: string
    phone?: string
    score?: number
    explanation?: string[]
    stage: Stage
    error?: string
    parse_method?: string
    screening_outcome: ScreeningOutcome
    screening_reason?: string
    graduation_year_info?: GraduationYearInfo
    preview_available?: boolean
  }
}

export interface WSCompleteMsg {
  type: 'complete'
  session_id: string
  total: number
  completed: number
  failed: number
}

export type WSMessage = WSProgressMsg | WSResultMsg | WSCompleteMsg

export interface JDStructured {
  role_title: string
  seniority_level?: string
  required_skills: string[]
  preferred_skills: string[]
  min_years_experience?: number
  preferred_years_experience?: number
  education_requirements?: {
    level?: string
    field?: string
    required?: boolean
  }
  responsibilities: string[]
  keywords: string[]
}

export interface ScoringDimension {
  name: string
  label: string
  description: string
  max_points: number
}

export interface ScoringSchema {
  dimensions: ScoringDimension[]
}

export type AppStep = 'jd' | 'upload' | 'processing' | 'results'
