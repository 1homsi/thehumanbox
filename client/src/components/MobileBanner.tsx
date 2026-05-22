import { useEffect, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const STORAGE_KEY = 'thb-mobile-banner-dismissed'

export function MobileBanner() {
  const isMobile = useIsMobile()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (!isMobile) return
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch { setDismissed(false) }
  }, [isMobile])

  if (!isMobile || dismissed) return null

  const close = () => {
    try { window.localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div className="mobile-banner" role="note">
      <span className="mobile-banner__icon" aria-hidden="true">🖥</span>
      <span className="mobile-banner__text">
        Best experienced on desktop &mdash; full UI, 3D world, panels.
      </span>
      <button
        type="button"
        className="mobile-banner__close"
        onClick={close}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
