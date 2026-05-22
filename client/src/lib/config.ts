const RAW_BASE = (import.meta.env.VITE_API_BASE ?? 'localhost:8000')
  .replace(/^https?:\/\//, '')
  .replace(/^wss?:\/\//, '')
  .replace(/\/$/, '')

const isLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(RAW_BASE)
const httpScheme = isLocal ? 'http' : 'https'
const wsScheme = isLocal ? 'ws' : 'wss'

export const API_BASE = `${httpScheme}://${RAW_BASE}`
export const WS_BASE = `${wsScheme}://${RAW_BASE}`
