import React from 'react'

interface HeaderProps {
  step: number
}

const STEPS = [
  { num: 1, label: 'Job Description' },
  { num: 2, label: 'Upload Resumes' },
  { num: 3, label: 'Processing' },
  { num: 4, label: 'Results' },
]

export const Header: React.FC<HeaderProps> = ({ step }) => (
  <header className="bg-dark-800 shadow-lg border-b border-white/10">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        {/* Logo + brand */}
        <div className="flex items-center gap-3">
          <div>
            <span className="text-white font-semibold text-lg tracking-tight">AI AFS</span>
            <p className="text-gray-400 text-xs -mt-0.5">AI-Powered Resume Filtering System</p>
          </div>
        </div>

        {/* Step indicator */}
        <nav className="hidden md:flex items-center gap-1">
          {STEPS.map((s, idx) => {
            const active = step === s.num
            const done = step > s.num
            return (
              <React.Fragment key={s.num}>
                {idx > 0 && (
                  <div className={`h-px w-8 ${done ? 'bg-brand-500' : 'bg-white/20'}`} />
                )}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active ? 'bg-brand-600 text-white' :
                  done   ? 'bg-brand-900 text-brand-300' :
                           'text-gray-500'
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${
                    active ? 'bg-white text-brand-600' :
                    done   ? 'bg-brand-400 text-white' :
                             'bg-white/10 text-gray-400'
                  }`}>
                    {done ? '✓' : s.num}
                  </span>
                  {s.label}
                </div>
              </React.Fragment>
            )
          })}
        </nav>
      </div>
    </div>
  </header>
)
