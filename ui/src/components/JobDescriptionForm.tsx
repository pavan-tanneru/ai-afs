import React, { useState } from 'react'
import { Briefcase, ChevronRight, Loader2 } from 'lucide-react'
import { parseJD } from '../api/client'
import type { JDStructured } from '../types'

interface Props {
  onParsed: (jdText: string, structured: JDStructured) => void
}

export const JobDescriptionForm: React.FC<Props> = ({ onParsed }) => {
  const [jdText, setJdText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<JDStructured | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jdText.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await parseJD(jdText)
      setPreview(res.structured as JDStructured)
      onParsed(jdText, res.structured as JDStructured)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse job description'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4">
          <Briefcase className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Paste Your Job Description</h1>
        <p className="text-gray-500 mt-2">
          We'll parse it into a structured format and use it to evaluate every resume.
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

      {preview && (
        <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-5">
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
      )}
    </div>
  )
}
