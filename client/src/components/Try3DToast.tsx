import { useEffect, useState } from 'react'
import { useUIStore } from '../stores/store'

/**
 * Bottom-center notification-style toast that invites the user to
 * try the 3D view. Appears once per browser (localStorage flag),
 * dismissable, and never returns after either dismissal or first
 * successful 3D toggle from the toast itself.
 *
 * Mount once at the App root; it renders nothing when there's no
 * reason to show (already in 3D, already dismissed, world not
 * loaded yet, or still warming up after splash).
 */
const STORAGE_KEY = 'thb-try-3d-dismissed'
const SHOW_DELAY_MS = 1500   // wait for splash + first paint to settle

export function Try3DToast() {
  const threeD = useUIStore((s) => s.viewFlags.threeD)
  const setViewFlag = useUIStore((s) => s.setViewFlag)
  const [visible, setVisible] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)

  useEffect(() => {
    // localStorage may throw in private mode / iframes — fail safe.
    let dismissed = false
    try { dismissed = window.localStorage.getItem(STORAGE_KEY) === '1' }
    catch { /* ignore */ }
    if (dismissed || threeD) return

    const id = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [threeD])

  if (!visible) return null

  const persist = () => {
    try { window.localStorage.setItem(STORAGE_KEY, '1') }
    catch { /* ignore */ }
  }

  const close = () => {
    persist()
    setAnimateOut(true)
    window.setTimeout(() => setVisible(false), 220)
  }

  const tryIt = () => {
    persist()
    setViewFlag('threeD', true)
    setAnimateOut(true)
    window.setTimeout(() => setVisible(false), 220)
  }

  return (
    <div
      className={`try-3d-toast${animateOut ? ' leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="try-3d-toast__icon" aria-hidden="true">
        {/* Tiny isometric cube — pure SVG so no font dependency. */}
        <svg viewBox="0 0 24 24" width="22" height="22">
          <defs>
            <linearGradient id="t3d-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#d8b270" />
              <stop offset="100%" stopColor="#8a6432" />
            </linearGradient>
          </defs>
          <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z"
                fill="url(#t3d-g)" stroke="#e5ddc7" strokeWidth="0.8" />
          <path d="M12 2 L21 7 L12 12 L3 7 Z"     fill="#e2c08a" opacity="0.9" />
          <path d="M12 12 L21 7  L21 17 L12 22 Z" fill="#a07a3a" opacity="0.9" />
        </svg>
      </div>
      <div className="try-3d-toast__body">
        <div className="try-3d-toast__title">
          Try the new 3D world
          <span className="try-3d-toast__beta">BETA</span>
        </div>
        <div className="try-3d-toast__sub">
          See organisms wander a real terrain — same simulation, new view.
        </div>
      </div>
      <button
        type="button"
        className="try-3d-toast__cta"
        onClick={tryIt}
        autoFocus
      >
        Try it
      </button>
      <button
        type="button"
        className="try-3d-toast__close"
        onClick={close}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
