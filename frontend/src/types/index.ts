export type Stage =
  | 'queued'
  | 'parsing'
  | 'extracting'
  | 'evaluating'
  | 'done'
  | 'error'
  | 'skipped'

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
  responsibilities: string[]
  keywords: string[]
}

export type AppStep = 'jd' | 'upload' | 'processing' | 'results'
