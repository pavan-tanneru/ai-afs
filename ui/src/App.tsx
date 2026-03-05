import React, { useState } from 'react'
import { Header } from './components/Header'
import { JobDescriptionForm } from './components/JobDescriptionForm'
import { ResumeUpload } from './components/ResumeUpload'
import { ProgressDashboard } from './components/ProgressDashboard'
import { ResultsTable } from './components/ResultsTable'
import { ExportButton } from './components/ExportButton'
import type { AppStep, CandidateProgress, JDStructured, ScoringSchema } from './types'

export default function App() {
  const [step, setStep] = useState<AppStep>('jd')
  const [jdText, setJdText] = useState('')
  const [jdStructured, setJdStructured] = useState<JDStructured | null>(null)
  const [scoringSchema, setScoringSchema] = useState<ScoringSchema | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [totalFiles, setTotalFiles] = useState(0)
  const [candidates, setCandidates] = useState<CandidateProgress[]>([])

  const handleJDParsed = (text: string, structured: JDStructured, schema: ScoringSchema) => {
    setJdText(text)
    setJdStructured(structured)
    setScoringSchema(schema)
    // Do NOT auto-advance — user reviews schema and clicks "Proceed"
  }

  const handleProceedToUpload = (editedSchema: ScoringSchema) => {
    setScoringSchema(editedSchema)
    setStep('upload')
  }

  const handleProcessingStarted = (sid: string, total: number) => {
    setSessionId(sid)
    setTotalFiles(total)
    setStep('processing')
  }

  const handleComplete = (finishedCandidates: CandidateProgress[]) => {
    setCandidates(finishedCandidates)
    setTimeout(() => setStep('results'), 1200)
  }

  const stepNum =
    step === 'jd'         ? 1 :
    step === 'upload'     ? 2 :
    step === 'processing' ? 3 : 4

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header step={stepNum} />

      <main className="flex-1">
        {step === 'jd' && (
          <JobDescriptionForm
            onParsed={handleJDParsed}
            onProceed={handleProceedToUpload}
          />
        )}

        {step === 'upload' && jdStructured && scoringSchema && (
          <ResumeUpload
            jdText={jdText}
            jdStructured={jdStructured}
            scoringSchema={scoringSchema}
            onProcessingStarted={handleProcessingStarted}
          />
        )}

        {step === 'processing' && sessionId && (
          <ProgressDashboard
            sessionId={sessionId}
            totalFiles={totalFiles}
            onComplete={handleComplete}
          />
        )}

        {step === 'results' && (
          <div>
            {/* Action bar */}
            <div className="border-b border-gray-200 bg-white shadow-sm">
              <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">
                    {candidates.filter(c => c.stage === 'done').length}
                  </span>{' '}
                  candidates ranked for{' '}
                  <span className="font-medium text-brand-600">{jdStructured?.role_title}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStep('jd')
                      setCandidates([])
                      setJdText('')
                      setJdStructured(null)
                      setScoringSchema(null)
                    }}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-brand-300 hover:text-brand-600 transition-colors"
                  >
                    New Search
                  </button>
                  {sessionId && (
                    <ExportButton
                      sessionId={sessionId}
                      count={candidates.filter(c => c.stage === 'done').length}
                    />
                  )}
                </div>
              </div>
            </div>

            <ResultsTable candidates={candidates} sessionId={sessionId || ''} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-3">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-xs text-gray-400">
          <span>AI AFS · AI-Powered Resume Filtering System</span>
        </div>
      </footer>
    </div>
  )
}
