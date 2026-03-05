import React, { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { getExportUrl } from '../api/client'

interface Props {
  sessionId: string
  count: number
}

export const ExportButton: React.FC<Props> = ({ sessionId, count }) => {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const url = getExportUrl(sessionId)
      const res = await fetch(url)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ai_afs_${sessionId.slice(0, 8)}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      console.error(e)
      alert('Export failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading || count === 0}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
    >
      {loading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
      ) : (
        <><Download className="w-4 h-4" /> Export Excel ({count})</>
      )}
    </button>
  )
}
