import { useEffect, useState } from 'react'
import { REPO_URL } from '../../shared/links'
import { trackEvent } from '../../shared/observability'
import { ToolSprite } from '../toolbar/ToolSprite'
import { screenBusy, TOAST_RETRY_MS } from './screenBusy'
import { t } from '../../i18n'

export const STAR_PROMPT_KEY = 'thb-star-prompt-v2'
/** v1 stored a bare 'shown' | 'dismissed' | 'starred'; only the starred outcome is carried over. */
export const LEGACY_STAR_PROMPT_KEY = 'thb-star-prompt-v1'
// Late enough that the first minutes belong to the world, not to prompts.
export const STAR_DELAY_MIN_MS = 3 * 60_000
export const STAR_DELAY_MAX_MS = 5 * 60_000
// A dismissal is not forever: ask again after a week, at most three times.
export const STAR_REASK_AFTER_MS = 7 * 24 * 60 * 60_000
export const STAR_MAX_ASKS = 3

type StarPromptState = {
  asks: number
  starred?: boolean
  dismissedAt?: number
}

type ReadResult = { ok: true; state: StarPromptState | null } | { ok: false }

function writeState(state: StarPromptState): boolean {
  try {
    window.localStorage.setItem(STAR_PROMPT_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function readState(): ReadResult {
  try {
    const raw = window.localStorage.getItem(STAR_PROMPT_KEY)
    if (!raw) {
      // Players who already starred under v1 must never be asked again; dismissals may be re-asked.
      if (window.localStorage.getItem(LEGACY_STAR_PROMPT_KEY) === 'starred') {
        const migrated: StarPromptState = { asks: 1, starred: true }
        if (!writeState(migrated)) return { ok: false }
        return { ok: true, state: migrated }
      }
      return { ok: true, state: null }
    }
    const parsed = JSON.parse(raw) as StarPromptState
    return { ok: true, state: typeof parsed.asks === 'number' ? parsed : null }
  } catch {
    return { ok: false }
  }
}

/** True when the prompt must stay hidden: already handled, out of asks, cooling down, or storage is unusable. */
function alreadyAsked(): boolean {
  const read = readState()
  if (!read.ok) return true
  const state = read.state
  if (!state) return false
  if (state.starred) return true
  if (state.asks >= STAR_MAX_ASKS) return true
  // Closing the tab mid-prompt is not a dismissal: ask again next visit.
  return state.dismissedAt !== undefined && Date.now() - state.dismissedAt < STAR_REASK_AFTER_MS
}

/**
 * Asks once per visit for a star on GitHub, up to three times over the player's lifetime,
 * with a week between dismissals. It turns up at a random moment a few minutes in, once the
 * player has had time to watch the world, and only when nothing else is on screen.
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
      // Another window may have handled the prompt while this one waited.
      if (alreadyAsked()) return
      const read = readState()
      if (!read.ok) return
      const asks = (read.state?.asks ?? 0) + 1
      if (!writeState({ ...read.state, asks })) return
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
    const read = readState()
    const asks = read.ok ? (read.state?.asks ?? 1) : 1
    writeState({ asks, dismissedAt: Date.now() })
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
            const read = readState()
            const asks = read.ok ? (read.state?.asks ?? 1) : 1
            writeState({ asks, starred: true })
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
