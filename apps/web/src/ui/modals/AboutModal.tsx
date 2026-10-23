import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { API_BASE } from '../../shared/config'
import { useUIStore } from '../../state/store'
import { useSimulationData } from '../../simulation/simulationData'
import { t } from '../../i18n'

interface Props {
  onClose: () => void
}

interface BackendVersion {
  name: string
  version: string
  git_sha: string
  built_at: number
}

const FE_GIT_SHA = (import.meta.env.VITE_GIT_SHA ?? 'dev') as string
const FE_BUILD_TS = Number(import.meta.env.VITE_BUILD_TS ?? 0)

function fmtTime(unixSec: number): string {
  if (!unixSec) return t('dialogs.about.unknown')
  const d = new Date(unixSec * 1000)
  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC')
}

function shortSha(sha: string): string {
  if (!sha || sha === 'dev' || sha === 'unknown') return sha
  return sha.slice(0, 12)
}

export function AboutModal({ onClose }: Props) {
  const [backend, setBackend] = useState<BackendVersion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nerdStats = useUIStore((s) => s.nerdStats)
  const { apiEnabled } = useSimulationData()

  useEffect(() => {
    if (!nerdStats || !apiEnabled) return
    const ctrl = new AbortController()
    fetch(`${API_BASE}/version`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j: BackendVersion) => setBackend(j))
      .catch((e) => {
        if (e.name === 'AbortError') return
        setError(e.message ?? String(e))
      })
    return () => ctrl.abort()
  }, [apiEnabled, nerdStats])

  return (
    <Modal open onClose={onClose} className="about-modal" title={t('dialogs.about.title')} hideTitle>
      <div className="about-head">
        <span className="about-title">{t('dialogs.about.heading')}</span>
        <button aria-label={t('dialogs.about.close')} className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="about-body">
        <p className="about-blurb">{t('dialogs.about.blurb')}</p>

        {nerdStats && (
          <>
            <div className="about-section">{t('dialogs.about.frontend')}</div>
            <div className="about-grid">
              <span className="about-k">{t('dialogs.about.commit')}</span>
              <span className="about-v">
                <code>{shortSha(FE_GIT_SHA)}</code>
              </span>
              <span className="about-k">{t('dialogs.about.built')}</span>
              <span className="about-v">{fmtTime(FE_BUILD_TS)}</span>
            </div>

            <div className="about-section">{t('dialogs.about.simulation')}</div>
            {!apiEnabled ? (
              <div className="about-grid">
                <span className="about-k">{t('dialogs.about.runtime')}</span>
                <span className="about-v">{t('dialogs.about.runtimeLocal')}</span>
              </div>
            ) : (
              <>
                {error && <div className="about-err">{t('dialogs.about.versionError', { error })}</div>}
                {!error && !backend && <div className="about-loading">{t('dialogs.about.loading')}</div>}
              </>
            )}
            {apiEnabled && backend && (
              <div className="about-grid">
                <span className="about-k">{t('dialogs.about.name')}</span>
                <span className="about-v">
                  {backend.name} v{backend.version}
                </span>
                <span className="about-k">{t('dialogs.about.commit')}</span>
                <span className="about-v">
                  <code>{shortSha(backend.git_sha)}</code>
                </span>
                <span className="about-k">{t('dialogs.about.built')}</span>
                <span className="about-v">{fmtTime(backend.built_at)}</span>
              </div>
            )}
          </>
        )}

        <div className="about-section">{t('dialogs.about.builtWith')}</div>
        <div className="about-links">
          <a href="https://github.com/1homsi/xip" target="_blank" rel="noreferrer">
            xipjs
          </a>
          <span className="about-built-with-detail">{t('dialogs.about.engineDetail')}</span>
        </div>

        <div className="about-section">{t('dialogs.about.links')}</div>
        <div className="about-links">
          <a href="https://github.com/1homsi/thehumanbox" target="_blank" rel="noreferrer">
            github.com/1homsi/thehumanbox
          </a>
          <br />
          <a href="https://instagram.com/watchthehumanbox" target="_blank" rel="noreferrer">
            instagram.com/watchthehumanbox
          </a>
        </div>
      </div>
    </Modal>
  )
}
