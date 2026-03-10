import React, { useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, XCircle, Eye } from 'lucide-react'
import type { CandidateProgress } from '../types'
import { getResumePreviewUrl } from '../api/client'

interface Props {
  candidates: CandidateProgress[]
  sessionId: string
}

type SortKey = 'score' | 'name'
type SortDir = 'asc' | 'desc'

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return <span className="text-gray-400 text-sm">—</span>
  const bg =
    score >= 80 ? 'bg-emerald-500' :
    score >= 60 ? 'bg-amber-500' :
    score >= 40 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <span className={`score-badge ${bg}`}>{score}</span>
  )
}

function StatusBadge({ stage }: { stage: string }) {
  if (stage === 'done') return (
    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
      <CheckCircle className="w-3.5 h-3.5" /> Ranked
    </span>
  )
  if (stage === 'filtered') return (
    <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
      <AlertTriangle className="w-3.5 h-3.5" /> Filtered
    </span>
  )
  if (stage === 'review') return (
    <span className="flex items-center gap-1 text-xs text-yellow-700 font-medium">
      <AlertTriangle className="w-3.5 h-3.5" /> Review
    </span>
  )
  if (stage === 'skipped') return (
    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
      <AlertTriangle className="w-3.5 h-3.5" /> Duplicate
    </span>
  )
  if (stage === 'error') return (
    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
      <XCircle className="w-3.5 h-3.5" /> Error
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
      <AlertTriangle className="w-3.5 h-3.5" /> {stage}
    </span>
  )
}

export const ResultsTable: React.FC<Props> = ({ candidates, sessionId }) => {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<'all' | 'done' | 'error'>('all')
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    let list = [...candidates]
    if (stageFilter !== 'all') list = list.filter(c => c.stage === stageFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.name || c.fileName).toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      if (sortKey === 'score') {
        const sa = a.score ?? -1, sb = b.score ?? -1
        return sortDir === 'desc' ? sb - sa : sa - sb
      }
      const na = (a.name || a.fileName).toLowerCase()
      const nb = (b.name || b.fileName).toLowerCase()
      return sortDir === 'desc' ? nb.localeCompare(na) : na.localeCompare(nb)
    })
    return list
  }, [candidates, search, sortKey, sortDir, stageFilter])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? null :
    sortDir === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />

  const warnings = candidates.filter(c => c.stage !== 'done')
  const previewCandidate = candidates.find(c => c.candidateId === previewingId) || null

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidate Rankings</h1>
          <p className="text-gray-500 text-sm mt-1">
            {candidates.filter(c => c.stage === 'done').length} ranked
            {warnings.length > 0 && ` · ${warnings.length} with issues`}
          </p>
        </div>
      </div>

      {/* Skipped/Error warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4" />
            {warnings.length} resume{warnings.length !== 1 ? 's' : ''} had issues
          </p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {warnings.map(c => (
              <li key={c.candidateId}>
                <span className="font-medium">{c.fileName}</span>
                {(c.error || c.screeningReason) && (
                  <span className="text-amber-600"> — {c.error || c.screeningReason}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'done', 'error'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStageFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                stageFilter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
              }`}
            >
              {f === 'all' ? `All (${candidates.length})` :
               f === 'done' ? `Ranked (${candidates.filter(c => c.stage === 'done').length})` :
               `Issues (${warnings.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider w-12">#</th>
                <th
                  className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => toggleSort('name')}
                >
                  <span className="flex items-center gap-1">Name <SortIcon k="name" /></span>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider hidden sm:table-cell">Contact</th>
                <th
                  className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer select-none text-center"
                  onClick={() => toggleSort('score')}
                >
                  <span className="flex items-center justify-center gap-1">Score <SortIcon k="score" /></span>
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wider hidden lg:table-cell">Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((c, idx) => (
                <React.Fragment key={c.candidateId}>
                  <tr
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${expandedId === c.candidateId ? 'bg-brand-50/40' : ''}`}
                    onClick={() => setExpandedId(expandedId === c.candidateId ? null : c.candidateId)}
                  >
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.name || '—'}</div>
                      <div className="text-gray-400 text-xs truncate max-w-[200px]">{c.fileName}</div>
                      {c.parseMethod === 'ocr' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">OCR</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="text-gray-600 text-xs">{c.email || '—'}</div>
                      <div className="text-gray-400 text-xs">{c.phone || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScoreBadge score={c.score} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge stage={c.stage} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell max-w-xs">
                      {c.explanation?.length ? (
                        <ul className="space-y-0.5">
                          {c.explanation.map((b, i) => (
                            <li key={i} className="text-xs text-gray-500 flex gap-1">
                              <span className="text-brand-400 flex-shrink-0">•</span>
                              <span className="line-clamp-1">{b}</span>
                            </li>
                          ))}
                        </ul>
                      ) : c.error || c.screeningReason ? (
                        <span className={`text-xs ${c.error ? 'text-red-400' : 'text-amber-700'}`}>
                          {c.error || c.screeningReason}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>

                  {/* Expanded row */}
                  {expandedId === c.candidateId && (
                    <tr className="bg-brand-50/20">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-semibold text-gray-700 mb-1">Contact</p>
                            <p className="text-gray-600">Email: {c.email || '—'}</p>
                            <p className="text-gray-600">Phone: {c.phone || '—'}</p>
                            <p className="text-gray-500 text-xs mt-1">File: {c.fileName}</p>
                            {c.parseMethod && <p className="text-gray-500 text-xs">Parsed via: {c.parseMethod}</p>}
                            {c.graduationYearInfo.selected_degree && (
                              <p className="text-gray-500 text-xs">
                                Degree used: {c.graduationYearInfo.selected_degree}
                              </p>
                            )}
                            {c.graduationYearInfo.source !== 'not_applicable' && (
                              <p className="text-gray-500 text-xs">
                                Graduation year: {c.graduationYearInfo.graduation_year ?? 'Unknown'} ({c.graduationYearInfo.source})
                              </p>
                            )}
                          </div>
                          {c.explanation && c.explanation.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-700 mb-1">Evaluation Rationale</p>
                              <ul className="space-y-1.5">
                                {c.explanation.map((b, i) => (
                                  <li key={i} className="flex gap-2 text-gray-600 text-xs">
                                    <span className="text-brand-500 font-bold mt-0.5">{i + 1}.</span>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {c.error && (
                            <div className="sm:col-span-2">
                              <p className="font-semibold text-red-600 mb-1">Error Details</p>
                              <p className="text-red-500 text-xs">{c.error}</p>
                            </div>
                          )}
                          {!c.error && c.screeningReason && (
                            <div className="sm:col-span-2">
                              <p className="font-semibold text-amber-700 mb-1">Screening Details</p>
                              <p className="text-amber-700 text-xs">{c.screeningReason}</p>
                            </div>
                          )}
                          {c.previewAvailable && (
                            <div className="sm:col-span-2 flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPreviewingId(c.candidateId)
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-brand-300 hover:text-brand-700 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                                Preview Resume
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No results match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewingId && (
        <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6 sm:p-8" onClick={() => {
          setPreviewingId(null)
        }}>
          <div
            className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-gray-900">{previewCandidate?.fileName || 'Resume preview'}</h2>
                <p className="text-xs text-gray-500">Original submitted PDF</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewingId(null)
                }}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-gray-50 px-5 py-4">
              <object
                data={`${getResumePreviewUrl(sessionId, previewingId)}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                type="application/pdf"
                className="h-full min-h-[70vh] w-full rounded-xl border border-gray-200 bg-white"
              >
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  PDF preview is not available in this browser.
                </div>
              </object>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
