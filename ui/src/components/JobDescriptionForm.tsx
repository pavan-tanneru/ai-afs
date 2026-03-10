import React, { useState } from 'react'
import { Briefcase, ChevronRight, Loader2, Trash2, Plus } from 'lucide-react'
import { parseJD } from '../api/client'
import type {
  GraduationYearFilterConfig,
  JDStructured,
  ScoringSchema,
  ScoringDimension,
} from '../types'

interface Props {
  onParsed: (jdText: string, structured: JDStructured, schema: ScoringSchema) => void
  onProceed: (schema: ScoringSchema, graduationFilter: GraduationYearFilterConfig) => void
}

function toSnakeCase(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

const EMPTY_NEW_DIM = { label: '', description: '', max_points: '' }
const DEFAULT_GRADUATION_FILTER: GraduationYearFilterConfig = {
  enabled: false,
  accepted_years: [],
  unknown_year_behavior: 'manual_review',
  degree_selection: 'highest_relevant_degree',
}
const CURRENT_YEAR = new Date().getFullYear()
const SUGGESTED_YEARS = Array.from({ length: 6 }, (_, idx) => CURRENT_YEAR - 1 + idx)

export const JobDescriptionForm: React.FC<Props> = ({ onParsed, onProceed }) => {
  const [jdText, setJdText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<JDStructured | null>(null)
  const [dims, setDims] = useState<ScoringDimension[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDim, setNewDim] = useState(EMPTY_NEW_DIM)
  const [addError, setAddError] = useState<string | null>(null)
  const [graduationFilter, setGraduationFilter] = useState<GraduationYearFilterConfig>(DEFAULT_GRADUATION_FILTER)
  const [yearInput, setYearInput] = useState('')
  const [yearError, setYearError] = useState<string | null>(null)

  const total = dims.reduce((s, d) => s + d.max_points, 0)
  const totalOk = total === 100
  const graduationFilterValid = !graduationFilter.enabled || graduationFilter.accepted_years.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jdText.trim()) return
    setLoading(true)
    setError(null)
    setPreview(null)
    setDims([])
    setShowAddForm(false)
    setGraduationFilter(DEFAULT_GRADUATION_FILTER)
    setYearInput('')
    setYearError(null)
    try {
      const res = await parseJD(jdText)
      const structured = res.structured as JDStructured
      const schema = res.scoring_schema as ScoringSchema
      setPreview(structured)
      setDims(schema.dimensions)
      onParsed(jdText, structured, schema)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse job description'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const updatePts = (idx: number, raw: string) => {
    const val = parseInt(raw, 10)
    setDims(prev => prev.map((d, i) => i === idx ? { ...d, max_points: isNaN(val) ? 0 : Math.max(0, Math.min(100, val)) } : d))
  }

  const updateLabel = (idx: number, label: string) => {
    setDims(prev => prev.map((d, i) => i === idx ? { ...d, label } : d))
  }

  const updateDescription = (idx: number, description: string) => {
    setDims(prev => prev.map((d, i) => i === idx ? { ...d, description } : d))
  }

  const removeDim = (idx: number) => {
    setDims(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAddDim = () => {
    setAddError(null)
    if (!newDim.label.trim()) { setAddError('Label is required.'); return }
    if (!newDim.description.trim()) { setAddError('Description is required.'); return }
    const pts = parseInt(newDim.max_points as string, 10)
    if (isNaN(pts) || pts <= 0) { setAddError('Points must be a positive number.'); return }
    const name = toSnakeCase(newDim.label)
    if (dims.some(d => d.name === name)) { setAddError('A dimension with this name already exists.'); return }
    setDims(prev => [...prev, { name, label: newDim.label.trim(), description: newDim.description.trim(), max_points: pts }])
    setNewDim(EMPTY_NEW_DIM)
    setShowAddForm(false)
  }

  const handleProceed = () => {
    onProceed({ dimensions: dims }, graduationFilter)
  }

  const addYear = (rawValue: string) => {
    const year = parseInt(rawValue.trim(), 10)
    if (isNaN(year) || year < 2000 || year > 2100) {
      setYearError('Enter a valid graduation year.')
      return
    }
    setGraduationFilter(prev => ({
      ...prev,
      accepted_years: Array.from(new Set([...prev.accepted_years, year])).sort((a, b) => a - b),
    }))
    setYearInput('')
    setYearError(null)
  }

  const removeYear = (year: number) => {
    setGraduationFilter(prev => ({
      ...prev,
      accepted_years: prev.accepted_years.filter(item => item !== year),
    }))
  }

  const toggleGraduationFilter = (enabled: boolean) => {
    setGraduationFilter(prev => ({
      ...prev,
      enabled,
      accepted_years: enabled ? prev.accepted_years : [],
    }))
    setYearInput('')
    setYearError(null)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4">
          <Briefcase className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Paste Your Job Description</h1>
        <p className="text-gray-500 mt-2">
          We'll parse it and generate a scoring rubric you can customize before evaluating resumes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          placeholder="Paste the full job description here…"
          rows={16}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y font-mono"
        />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || !jdText.trim()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing JD…</>
            ) : (
              <>Parse Job Description <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </form>

      {preview && dims.length > 0 && (
        <div className="mt-8 space-y-4">
          {/* JD summary */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-5">
            <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500 text-white text-xs flex items-center justify-center">✓</span>
              JD Parsed Successfully
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-gray-700">Role:</span>{' '}
                <span className="text-gray-900">{preview.role_title}</span>
              </div>
              {preview.seniority_level && (
                <div>
                  <span className="font-medium text-gray-700">Seniority:</span>{' '}
                  <span className="text-gray-900">{preview.seniority_level}</span>
                </div>
              )}
              {preview.min_years_experience !== undefined && preview.min_years_experience !== null && (
                <div>
                  <span className="font-medium text-gray-700">Min Experience:</span>{' '}
                  <span className="text-gray-900">{preview.min_years_experience} yrs</span>
                </div>
              )}
            </div>
            {preview.required_skills?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Required Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.required_skills.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs font-medium">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Editable scoring schema */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-amber-900">Graduation Year Filter</h3>
                <p className="text-xs text-amber-700 mt-1">
                  Optional. Use this for intern and fresher roles when only specific graduating batches should be considered.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-amber-900">
                <input
                  type="checkbox"
                  checked={graduationFilter.enabled}
                  onChange={e => toggleGraduationFilter(e.target.checked)}
                  className="rounded border-amber-300 text-brand-600 focus:ring-brand-500"
                />
                Enable filter
              </label>
            </div>

            {graduationFilter.enabled && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">
                    Accepted Graduation Years
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_YEARS.map(year => {
                      const active = graduationFilter.accepted_years.includes(year)
                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={() => active ? removeYear(year) : addYear(String(year))}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            active
                              ? 'bg-brand-600 text-white'
                              : 'bg-white border border-amber-200 text-amber-800 hover:border-brand-300'
                          }`}
                        >
                          {year}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={yearInput}
                    onChange={e => setYearInput(e.target.value)}
                    placeholder="Add another year"
                    className="w-full sm:w-44 text-sm border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => addYear(yearInput)}
                    className="px-3 py-2 rounded-lg bg-white border border-amber-200 text-sm text-amber-900 hover:border-brand-300 transition-colors"
                  >
                    Add year
                  </button>
                  <p className="text-xs text-amber-700">
                    Unknown or low-confidence graduation years will go to manual review.
                  </p>
                </div>

                {graduationFilter.accepted_years.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {graduationFilter.accepted_years.map(year => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => removeYear(year)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-amber-200 text-xs text-amber-900 hover:border-red-300"
                      >
                        {year}
                        <Trash2 className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}

                {yearError && <p className="text-xs text-red-600">{yearError}</p>}
                {!graduationFilterValid && (
                  <p className="text-xs text-red-600 font-medium">
                    Add at least one accepted graduation year to enable this filter.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-semibold text-blue-800">Scoring Rubric</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                totalOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {total} / 100 pts
              </span>
            </div>
            <p className="text-xs text-blue-600 mb-4">
              Edit labels, descriptions, and weights. Total must equal exactly 100.
            </p>

            <div className="space-y-2">
              {dims.map((dim, idx) => (
                <div key={dim.name} className="rounded-lg bg-white border border-blue-100 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {/* Label */}
                    <input
                      type="text"
                      value={dim.label}
                      onChange={e => updateLabel(idx, e.target.value)}
                      className="flex-1 min-w-0 text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none py-0.5"
                      placeholder="Dimension label"
                    />
                    {/* Points */}
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={dim.max_points}
                        onChange={e => updatePts(idx, e.target.value)}
                        className="w-14 text-center text-sm font-semibold rounded-lg border border-blue-200 bg-brand-50 text-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-500 py-1"
                      />
                      <span className="text-xs text-gray-400">pts</span>
                    </div>
                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => removeDim(idx)}
                      className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove dimension"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Description */}
                  <input
                    type="text"
                    value={dim.description}
                    onChange={e => updateDescription(idx, e.target.value)}
                    className="w-full text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-400 focus:outline-none py-0.5"
                    placeholder="What does this dimension measure?"
                  />
                </div>
              ))}
            </div>

            {/* Add dimension */}
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => { setShowAddForm(true); setAddError(null) }}
                className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Add dimension
              </button>
            ) : (
              <div className="mt-3 rounded-lg bg-white border border-blue-200 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-gray-600">New Dimension</p>
                <input
                  type="text"
                  value={newDim.label}
                  onChange={e => setNewDim(d => ({ ...d, label: e.target.value }))}
                  placeholder="Label (e.g. Communication Skills)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <input
                  type="text"
                  value={newDim.description}
                  onChange={e => setNewDim(d => ({ ...d, description: e.target.value }))}
                  placeholder="Description (one sentence)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newDim.max_points}
                    onChange={e => setNewDim(d => ({ ...d, max_points: e.target.value }))}
                    placeholder="Points"
                    className="w-24 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <span className="text-xs text-gray-400">pts</span>
                </div>
                {addError && <p className="text-xs text-red-600">{addError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAddDim}
                    className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setNewDim(EMPTY_NEW_DIM); setAddError(null) }}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Total validation */}
            {!totalOk && (
              <p className="mt-3 text-xs text-red-600 font-medium">
                Weights must sum to exactly 100. Current total: {total} pts.
              </p>
            )}
          </div>

          {/* Proceed button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleProceed}
              disabled={!totalOk || !graduationFilterValid || dims.length === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              Looks good — proceed to upload <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
