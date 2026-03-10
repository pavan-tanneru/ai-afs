import React, { useCallback, useRef, useState } from 'react'
import { Upload, FileText, X, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import type { GraduationYearFilterConfig, JDStructured, ScoringSchema } from '../types'
import { processResumes } from '../api/client'

interface Props {
  jdText: string
  jdStructured: JDStructured
  scoringSchema: ScoringSchema
  graduationFilter: GraduationYearFilterConfig
  onProcessingStarted: (sessionId: string, totalFiles: number) => void
}

export const ResumeUpload: React.FC<Props> = ({
  jdText,
  jdStructured,
  scoringSchema,
  graduationFilter,
  onProcessingStarted,
}) => {
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    const valid = Array.from(incoming).filter(f =>
      f.name.endsWith('.pdf') || f.name.endsWith('.docx')
    )
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size))
      return [...prev, ...valid.filter(f => !existing.has(f.name + f.size))]
    })
  }

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const handleSubmit = async () => {
    if (!files.length) return
    setLoading(true)
    setError(null)
    try {
      const res = await processResumes(jdText, files, scoringSchema, graduationFilter)
      onProcessingStarted(res.session_id, res.total_files)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start processing'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4">
          <Upload className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Resumes</h1>
        <p className="text-gray-500 mt-2">
          PDF and DOCX supported &nbsp;·&nbsp; Up to 1,000+ files
        </p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs text-brand-700">
          <span className="font-medium">Role:</span> {jdStructured.role_title}
        </div>
        {graduationFilter.enabled && graduationFilter.accepted_years.length > 0 && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-xs text-amber-700">
            <span className="font-medium">Grad years:</span> {graduationFilter.accepted_years.join(', ')}
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx"
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
        <Upload className={`w-10 h-10 mx-auto mb-3 ${dragging ? 'text-brand-500' : 'text-gray-400'}`} />
        <p className="text-gray-600 font-medium">Drop resume files here, or <span className="text-brand-600">browse</span></p>
        <p className="text-gray-400 text-sm mt-1">PDF · DOCX &nbsp;·&nbsp; Max 20 MB per file</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">{files.length} file{files.length !== 1 ? 's' : ''} selected</p>
            <button onClick={() => setFiles([])} className="text-xs text-red-500 hover:text-red-700">Clear all</button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin pr-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-brand-500 flex-shrink-0" />
                  <span className="truncate text-gray-700">{f.name}</span>
                  <span className="text-gray-400 text-xs flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button onClick={() => removeFile(i)} className="ml-2 flex-shrink-0 text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={loading || files.length === 0}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Starting pipeline…</>
          ) : (
            <>Start Ranking {files.length > 0 && `(${files.length})`} <ChevronRight className="w-4 h-4" /></>
          )}
        </button>
      </div>
    </div>
  )
}
