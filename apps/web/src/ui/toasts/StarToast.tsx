import { useEffect, useState } from 'react'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import { ToolSprite } from '../toolbar/ToolSprite'
import { screenBusy, TOAST_RETRY_MS } from './screenBusy'
import { t } from '../../i18n'

export const STAR_PROMPT_KEY = 'thb-star-prompt-v1'
// Late enough that the first minutes belong to the world, not to prompts.
export const STAR_DELAY_MIN_MS = 3 * 60_000
export const STAR_DELAY_MAX_MS = 5 * 60_000

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

/**
 * Asks once, during the first visit, for a star on GitHub. It turns up at a random moment a few minutes
 * in, once the player has had time to watch the world, and only when nothing else is on screen.
 */
export function StarToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (alreadyAsked()) return
    let timer = 0
    const show = () => {
      if (screenBusy()) {
        timer = window.setTimeout(show, TOAST_RETRY_MS)
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
      <button className="desktop-toast-close" aria-label={t('dialogs.toast.dismiss')} onClick={dismiss}>
        ×
      </button>
      <div className="star-toast-head">
        <span className="star-toast-star" aria-hidden="true">
          <ToolSprite icon="⭐" size={28} />
        </span>
        <div className="desktop-toast-title">{t('dialogs.toast.starTitle')}</div>
      </div>
      <div className="desktop-toast-sub">{t('dialogs.toast.starSub')}</div>
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
          {t('dialogs.toast.starCta')}
        </a>
        <button className="desktop-toast-secondary" onClick={dismiss}>
          {t('dialogs.toast.starLater')}
        </button>
      </div>
    </div>
  )
}
