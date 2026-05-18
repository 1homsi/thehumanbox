// API endpoint configuration.
//
// In dev, defaults point at localhost:8000 (matches the Rust simulation server).
// In production (Cloudflare Pages), set VITE_API_BASE to e.g. "api.thehumanbox.com"
// at build time and the URLs below will be rewritten automatically.
//
// VITE_API_BASE should be the host[:port], without scheme or path.
// Examples:
//   VITE_API_BASE=localhost:8000          → http://localhost:8000  / ws://localhost:8000
//   VITE_API_BASE=api.thehumanbox.com     → https://api.thehumanbox.com / wss://api.thehumanbox.com
//   VITE_API_BASE=10.0.0.5:8000           → http://10.0.0.5:8000 / ws://10.0.0.5:8000

const RAW_BASE = (import.meta.env.VITE_API_BASE ?? 'localhost:8000').replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '')

// Use TLS in production (anything that isn't localhost / a private IP).
const isLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(RAW_BASE)
const httpScheme = isLocal ? 'http' : 'https'
const wsScheme   = isLocal ? 'ws'   : 'wss'

export const API_BASE = `${httpScheme}://${RAW_BASE}`
export const WS_BASE  = `${wsScheme}://${RAW_BASE}`
