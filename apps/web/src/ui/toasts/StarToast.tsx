import { useEffect, useState } from 'react'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import { useUIStore } from '../../state/store'
import { ToolSprite } from '../toolbar/ToolSprite'

export const STAR_PROMPT_KEY = 'thb-star-prompt-v1'
export const STAR_DELAY_MIN_MS = 45_000
export const STAR_DELAY_MAX_MS = 120_000
/** How often a due prompt looks again while something else holds the screen. */
export const STAR_RETRY_MS = 5_000
/** Cards the prompt waits behind, so it never stacks on the welcome, the tour, a dialog or another toast. */
const BUSY =
  '.welcome-modal, .thb-shepherd, .thb-modal, .desktop-toast, .update-toast, .mobile-banner, .idle-resume-panel'

function alreadyAsked(): boolean {
  try {
    return window.localStorage.getItem(STAR_PROMPT_KEY) !== null
  } catch {
    // Without storage the prompt could not remember it was shown, and would ask every visit.
    return true
  }
}

function remember(outcome: 'shown' | 'starred' | 'dismissed') {
  try {
    window.localStorage.setItem(STAR_PROMPT_KEY, outcome)
  } catch {
    /* noop */
  }
}

function screenBusy(): boolean {
  const { photoMode, hideUI } = useUIStore.getState().viewFlags
  return document.hidden || photoMode || hideUI || document.querySelector(BUSY) !== null
}

/**
 * Asks once, during the first visit, for a star on GitHub. It turns up at a random moment after the
 * player has had time to watch the world, and only when nothing else is on screen.
 */
export function StarToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (alreadyAsked()) return
    let timer = 0
    const show = () => {
      if (screenBusy()) {
        timer = window.setTimeout(show, STAR_RETRY_MS)
        return
      }
      remember('shown')
      setVisible(true)
      trackEvent('star_prompt_shown')
    }
    timer = window.setTimeout(
      show,
      STAR_DELAY_MIN_MS + Math.random() * (STAR_DELAY_MAX_MS - STAR_DELAY_MIN_MS),
    )
    return () => window.clearTimeout(timer)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    remember('dismissed')
    setVisible(false)
    trackEvent('star_prompt_dismissed')
  }

  return (
    <div className="desktop-toast star-toast" role="status" aria-live="polite">
      <button className="desktop-toast-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
      <div className="star-toast-head">
        <span className="star-toast-star" aria-hidden="true">
          <ToolSprite icon="⭐" size={28} />
        </span>
        <div className="desktop-toast-title">Enjoying your world?</div>
      </div>
      <div className="desktop-toast-sub">
        The Human Box is free and open source. A star on GitHub helps other people find it.
      </div>
      <div className="desktop-toast-actions">
        <a
          className="desktop-toast-primary"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            remember('starred')
            setVisible(false)
            trackEvent('star_prompt_clicked')
          }}
        >
          <span className="star-toast-glyph" aria-hidden="true">
            ★
          </span>{' '}
          Star on GitHub
        </a>
        <button className="desktop-toast-secondary" onClick={dismiss}>
          Maybe later
        </button>
      </div>
    </div>
  )
}
