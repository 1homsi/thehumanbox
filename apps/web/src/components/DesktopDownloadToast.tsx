import { useEffect, useState } from 'react'
import { getDesktop } from '../lib/desktop'
import { trackEvent } from '../lib/observability'

const RELEASES_URL = 'https://github.com/1homsi/thehumanbox/releases/latest'
const INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/1homsi/thehumanbox/main/scripts/install-desktop.sh | bash'
const STORAGE_KEY = 'thb-desktop-toast-dismissed-at'
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const FIRST_DELAY_MIN_MS = 30_000
const FIRST_DELAY_MAX_MS = 90_000

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const p = navigator.platform ?? ''
  const ua = navigator.userAgent ?? ''
  return /Mac|iPhone|iPad|iPod/.test(p) || /Macintosh/.test(ua)
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent ?? '')
}

function shouldShow(): boolean {
  if (getDesktop()) return false
  if (isMobile()) return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return true
    const last = parseInt(raw, 10)
    if (!Number.isFinite(last)) return true
    return Date.now() - last >= COOLDOWN_MS
  } catch {
    return true
  }
}

export function DesktopDownloadToast() {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!shouldShow()) return
    const delay = FIRST_DELAY_MIN_MS + Math.random() * (FIRST_DELAY_MAX_MS - FIRST_DELAY_MIN_MS)
    const timer = window.setTimeout(() => setVisible(true), delay)
    return () => window.clearTimeout(timer)
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {
      /* noop */
    }
  }

  function onCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard
      .writeText(INSTALL_CMD)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {
        /* noop */
      })
  }

  if (!visible) return null

  const mac = isMac()

  return (
    <div className="desktop-toast" role="status" aria-live="polite">
      <button className="desktop-toast-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
      <div className="desktop-toast-title">Run The Human Box locally</div>
      <div className="desktop-toast-sub">
        Your own private world, no shared latency, full local AI hooks. Free.
      </div>
      {mac ? (
        <div className="desktop-toast-cmd-row">
          <code className="desktop-toast-cmd">{INSTALL_CMD}</code>
          <button className="desktop-toast-copy" onClick={onCopy}>
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
      ) : null}
      <div className="desktop-toast-actions">
        <a
          className="desktop-toast-primary"
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            trackEvent('desktop_toast_download_clicked', { mac })
          }}
        >
          Download
        </a>
        <button className="desktop-toast-secondary" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}
