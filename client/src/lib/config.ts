function readRuntimeOverride(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const api = params.get('api')
    if (api && api.trim().length > 0) return api.trim()
  } catch {
    /* file:// without search support, ignore */
  }
  return null
}

const RAW_BASE = (readRuntimeOverride() ?? import.meta.env.VITE_API_BASE ?? 'localhost:8000')
  .replace(/^https?:\/\//, '')
  .replace(/^wss?:\/\//, '')
  .replace(/\/$/, '')

const isLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(RAW_BASE)
const httpScheme = isLocal ? 'http' : 'https'
const wsScheme = isLocal ? 'ws' : 'wss'

export const API_BASE = `${httpScheme}://${RAW_BASE}`
export const WS_BASE = `${wsScheme}://${RAW_BASE}`
