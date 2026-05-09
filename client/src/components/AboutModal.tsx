import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { API_BASE } from '../config'

interface Props {
  onClose: () => void
}

interface BackendVersion {
  name:     string
  version:  string
  git_sha:  string
  built_at: number
}

const FE_GIT_SHA  = (import.meta.env.VITE_GIT_SHA  ?? 'dev') as string
const FE_BUILD_TS = Number(import.meta.env.VITE_BUILD_TS ?? 0)

function fmtTime(unixSec: number): string {
  if (!unixSec) return 'unknown'
  const d = new Date(unixSec * 1000)
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

function shortSha(sha: string): string {
  if (!sha || sha === 'dev' || sha === 'unknown') return sha
  return sha.slice(0, 12)
}

export function AboutModal({ onClose }: Props) {
  const [backend, setBackend] = useState<BackendVersion | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`${API_BASE}/version`, { signal: ctrl.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j: BackendVersion) => setBackend(j))
      .catch(e => {
        if (e.name === 'AbortError') return
        setError(e.message ?? String(e))
      })
    return () => ctrl.abort()
  }, [])

  return (
    <Modal open onClose={onClose} className="about-modal" title="About" hideTitle>
      <div className="about-head">
        <span className="about-title">ABOUT</span>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="about-body">
        <p className="about-blurb">
          The Human Box is a living simulation of small agents that
          forage, bond, build language, and pass it on to their
          children. Open source on GitHub.
        </p>

        <div className="about-section">FRONTEND</div>
        <div className="about-grid">
          <span className="about-k">commit</span>
          <span className="about-v"><code>{shortSha(FE_GIT_SHA)}</code></span>
          <span className="about-k">built</span>
          <span className="about-v">{fmtTime(FE_BUILD_TS)}</span>
        </div>

        <div className="about-section">BACKEND</div>
        {error && (
          <div className="about-err">
            could not reach simulation /version: {error}
          </div>
        )}
        {!error && !backend && (
          <div className="about-loading">loading…</div>
        )}
        {backend && (
          <div className="about-grid">
            <span className="about-k">name</span>
            <span className="about-v">{backend.name} v{backend.version}</span>
            <span className="about-k">commit</span>
            <span className="about-v"><code>{shortSha(backend.git_sha)}</code></span>
            <span className="about-k">built</span>
            <span className="about-v">{fmtTime(backend.built_at)}</span>
          </div>
        )}

        <div className="about-section">LINKS</div>
        <div className="about-links">
          <a href="https://github.com/stackxio/thehumanbox" target="_blank" rel="noreferrer">github.com/stackxio/thehumanbox</a>
        </div>
      </div>
    </Modal>
  )
}
