import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

export const api = axios.create({ baseURL: BASE })

export async function parseJD(jdText: string) {
  const res = await api.post('/api/jobs/parse', { jd_text: jdText })
  return res.data as { jd_id: string; structured: unknown }
}

export async function processResumes(jdText: string, files: File[]) {
  const form = new FormData()
  form.append('jd_text', jdText)
  files.forEach(f => form.append('files', f))
  const res = await api.post('/api/resumes/process', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data as { session_id: string; total_files: number; message: string }
}

export function getExportUrl(sessionId: string) {
  return `${BASE}/api/export/${sessionId}`
}

export function createWebSocket(sessionId: string): WebSocket {
  const wsBase = import.meta.env.VITE_WS_URL
    || (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host
  return new WebSocket(`${wsBase}/ws/${sessionId}`)
}
