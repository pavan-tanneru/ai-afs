import React, { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react'
import { createWebSocket } from '../api/client'
import type { CandidateProgress, Stage, WSMessage } from '../types'

interface Props {
  sessionId: string
  totalFiles: number
  onComplete: (candidates: CandidateProgress[]) => void
}

const STAGE_LABEL: Record<Stage, string> = {
  queued:     'Queued',
  parsing:    'Parsing file',
  extracting: 'Extracting data',
  evaluating: 'Evaluating fit',
  done:       'Complete',
  error:      'Error',
  skipped:    'Skipped',
}

const STAGE_ORDER: Stage[] = ['queued', 'parsing', 'extracting', 'evaluating', 'done']

function StageBar({ stage }: { stage: Stage }) {
  const idx = STAGE_ORDER.indexOf(stage)
  const isError = stage === 'error' || stage === 'skipped'
  return (
    <div className="flex items-center gap-1 mt-1">
      {STAGE_ORDER.slice(0, 4).map((s, i) => {
        const filled = !isError && idx >= i + 1
        const active = !isError && STAGE_ORDER[idx] === s
        return (
          <div key={s} className="flex items-center gap-1">
            <div className={`h-1.5 w-8 rounded-full transition-all duration-500 ${
              filled ? 'bg-brand-500' :
              active ? 'bg-brand-300 animate-pulse' :
              isError ? 'bg-red-200' : 'bg-gray-200'
            }`} />
          </div>
        )
      })}
    </div>
  )
}

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return null
  const color =
    score >= 80 ? 'bg-emerald-500' :
    score >= 60 ? 'bg-amber-500' :
    score >= 40 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <span className={`score-badge ${color} text-xs`}>{score}</span>
  )
}

export const ProgressDashboard: React.FC<Props> = ({ sessionId, totalFiles, onComplete }) => {
  const [candidates, setCandidates] = useState<Map<string, CandidateProgress>>(new Map())
  const [completed, setCompleted] = useState(0)
  const [failed, setFailed] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const [filter, setFilter] = useState<'all' | 'done' | 'processing' | 'error'>('all')
  const wsRef = useRef<WebSocket | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const ws = createWebSocket(sessionId)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data)

      if (msg.type === 'progress') {
        setCandidates(prev => {
          const next = new Map(prev)
          const existing = next.get(msg.candidate_id) || {
            candidateId: msg.candidate_id,
            fileName: msg.candidate_id,
            stage: 'queued' as Stage,
          }
          next.set(msg.candidate_id, { ...existing, stage: msg.stage })
          return next
        })
      } else if (msg.type === 'result') {
        const r = msg.result
        setCandidates(prev => {
          const next = new Map(prev)
          next.set(msg.candidate_id, {
            candidateId: r.candidate_id,
            fileName: r.file_name,
            name: r.name,
            email: r.email,
            phone: r.phone,
            score: r.score,
            explanation: r.explanation,
            stage: r.stage as Stage,
            error: r.error,
            parseMethod: r.parse_method,
          })
          return next
        })
        if (r.stage === 'done') setCompleted(c => c + 1)
        else setFailed(f => f + 1)
      } else if (msg.type === 'complete') {
        setIsDone(true)
        ws.close()
      }
    }

    ws.onerror = () => console.error('WebSocket error')

    return () => ws.close()
  }, [sessionId])

  useEffect(() => {
    if (isDone) {
      onCompleteRef.current(Array.from(candidates.values()))
    }
  }, [isDone, candidates])

  const all = Array.from(candidates.values())
  const filtered = filter === 'all' ? all :
    filter === 'done' ? all.filter(c => c.stage === 'done') :
    filter === 'processing' ? all.filter(c => !['done','error','skipped'].includes(c.stage)) :
    all.filter(c => c.stage === 'error' || c.stage === 'skipped')

  const progress = totalFiles > 0 ? Math.round(((completed + failed) / totalFiles) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {isDone ? (
              <CheckCircle className="w-6 h-6 text-emerald-500" />
            ) : (
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            )}
            {isDone ? 'Processing Complete' : 'Processing Resumes…'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {completed} completed · {failed} failed · {totalFiles - completed - failed} remaining
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{progress}% complete</span>
          <span>{completed + failed} / {totalFiles}</span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'processing', 'done', 'error'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${all.length})`}
            {f === 'done' && ` (${all.filter(c => c.stage === 'done').length})`}
            {f === 'processing' && ` (${all.filter(c => !['done','error','skipped'].includes(c.stage)).length})`}
            {f === 'error' && ` (${all.filter(c => c.stage === 'error' || c.stage === 'skipped').length})`}
          </button>
        ))}
      </div>

      {/* Candidate cards */}
      <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto scrollbar-thin pr-1">
        {filtered.map(c => (
          <div
            key={c.candidateId}
            className={`bg-white border rounded-xl px-4 py-3 flex items-start gap-3 transition-all ${
              c.stage === 'done' ? 'border-emerald-100' :
              c.stage === 'error' ? 'border-red-100 bg-red-50/30' :
              'border-gray-100'
            }`}
          >
            {/* Status icon */}
            <div className="mt-0.5 flex-shrink-0">
              {c.stage === 'done' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> :
               c.stage === 'error' ? <XCircle className="w-5 h-5 text-red-400" /> :
               c.stage === 'skipped' ? <AlertTriangle className="w-5 h-5 text-amber-400" /> :
               <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">
                    {c.name || c.fileName}
                  </p>
                  {c.name && (
                    <p className="text-gray-400 text-xs truncate flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {c.fileName}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {STAGE_LABEL[c.stage]}
                    {c.parseMethod === 'ocr' && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs">OCR</span>
                    )}
                  </p>
                  <StageBar stage={c.stage} />
                </div>
                <ScoreBadge score={c.score} />
              </div>

              {/* Error message */}
              {c.error && (
                <p className="text-xs text-red-500 mt-1 truncate">{c.error}</p>
              )}

              {/* Explanation preview */}
              {c.stage === 'done' && c.explanation && c.explanation.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {c.explanation.map((b, i) => (
                    <li key={i} className="text-xs text-gray-500 flex gap-1">
                      <span className="text-brand-400">•</span>
                      <span className="truncate">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No candidates in this view yet…
          </div>
        )}
      </div>
    </div>
  )
}
