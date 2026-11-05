import { useEffect, useState } from 'react'
import type { PrayerInfo, WorldState } from '../../shared/types'
import { sortPrayers } from '../../game/model/prayers'
import { ToolSprite } from '../toolbar/ToolSprite'
import { t } from '../../i18n'
import { screenBusy } from '../toasts/screenBusy'

const SEEN_KEY = 'thb-prayer-hint-seen-v1'
/** How often the hint checks whether a dialog or another card came or went. Quicker than TOAST_RETRY_MS, since it must also step aside. */
const HINT_LOOK_MS = 1_000

function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // The hint simply shows again next time.
  }
}

/**
 * Something else holds the screen: the welcome card, the tour, a dialog, or another card such as the star prompt,
 * which sits in the same bottom-left spot. The hint waits, so the player meets one thing at a time and never gets a
 * card over a dialog or over another card's buttons.
 */
const busy = () => typeof document !== 'undefined' && screenBusy('.prayer-hint')

interface Props {
  world: WorldState | null
  onAnswer: (prayer: PrayerInfo) => void
}

/**
 * A one-time hint the first time a tribe prays, so a new player learns that
 * the bubbles over villages are calls for help. Gone for good once acted on,
 * dismissed, or once the player answers a prayer on their own.
 */
export function PrayerHint({ world, onAnswer }: Props) {
  const [done, setDone] = useState(seen)
  const prayers = world?.prayers ?? []
  const answered = world?.faith?.answered ?? 0

  // A paused world sends no frames, so look again on a timer: a dialog opened over the hint hides it, and the hint
  // comes back once the dialog closes.
  const [, setLook] = useState(0)
  const waiting = !done && prayers.length > 0
  useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(() => setLook((n) => n + 1), HINT_LOOK_MS)
    return () => window.clearInterval(id)
  }, [waiting])

  useEffect(() => {
    if (!done && answered > 0) {
      markSeen()
      setDone(true)
    }
  }, [answered, done])

  if (done || prayers.length === 0 || !world || busy()) return null
  const close = () => {
    markSeen()
    setDone(true)
  }

  return (
    <div className="update-toast prayer-hint" role="status" aria-live="polite">
      <div className="update-toast__icon" aria-hidden="true">
        <ToolSprite icon="🙏" size={20} />
      </div>
      <div className="update-toast__body">
        <div className="update-toast__title">{t('panels.prayerHint.title')}</div>
        <div className="update-toast__sub">{t('panels.prayerHint.body')}</div>
      </div>
      <button
        type="button"
        className="update-toast__cta"
        onClick={() => {
          const first = sortPrayers(prayers, world.tick)[0]
          close()
          if (first) onAnswer(first)
        }}
      >
        {t('panels.prayerHint.showMe')}
      </button>
      <button
        type="button"
        className="update-toast__close"
        onClick={close}
        aria-label={t('panels.prayerHint.dismiss')}
      >
        ×
      </button>
    </div>
  )
}
