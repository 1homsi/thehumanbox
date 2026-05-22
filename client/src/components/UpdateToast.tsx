import { useState } from 'react'
import { useVersionCheck } from '../hooks/useVersionCheck'

export function UpdateToast() {
  const { newVersionAvailable } = useVersionCheck()
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)

  if (!newVersionAvailable || dismissed) return null

  const reload = () => {
    setReloading(true)
    window.setTimeout(() => window.location.reload(), 80)
  }

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <div className="update-toast__icon" aria-hidden="true">⤴</div>
      <div className="update-toast__body">
        <div className="update-toast__title">New version available</div>
        <div className="update-toast__sub">refresh to load the latest world</div>
      </div>
      <button
        type="button"
        className="update-toast__cta"
        onClick={reload}
        disabled={reloading}
        autoFocus
      >
        {reloading ? 'refreshing…' : 'Refresh'}
      </button>
      <button
        type="button"
        className="update-toast__close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
