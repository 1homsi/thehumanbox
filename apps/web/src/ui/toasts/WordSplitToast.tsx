import { useEffect, useRef, useState } from 'react'
import type { WorldState } from '../../shared/types'
import { t } from '../../i18n'
import { WordSplitWatch, type WordSplit } from '../../game/model/word-split'
import { getOwnWorldSeed } from '../../simulation/worldSource'
import { screenBusy, TOAST_RETRY_MS } from './screenBusy'

/** Holds the seed of the world the notice was last shown for, so each world shows it once. */
export const WORD_SPLIT_KEY = 'thb-word-split-shown'
/** How long the notice stays up before it goes away on its own. */
export const WORD_SPLIT_SHOW_MS = 12_000

function worldKey(): string {
  try {
    return getOwnWorldSeed()
  } catch {
    return ''
  }
}

function alreadyShown(key: string): boolean {
  try {
    return window.localStorage.getItem(WORD_SPLIT_KEY) === key
  } catch {
    // Without storage the notice could not remember it was shown, and would return every frame.
    return true
  }
}

function remember(key: string) {
  try {
    window.localStorage.setItem(WORD_SPLIT_KEY, key)
  } catch {
    /* noop */
  }
}

/**
 * Tells the player once per world, the first time two tribes that shared a word for a thing stop
 * sharing it. Waits for an empty screen, like the other toasts, and goes away on its own.
 */
export function WordSplitToast({ world }: { world: WorldState | null }) {
  const watch = useRef<WordSplitWatch | null>(null)
  const seenWords = useRef<unknown>(null)
  const lastTick = useRef(-Infinity)
  const [split, setSplit] = useState<WordSplit | null>(null)
  const [visible, setVisible] = useState(false)

  // Only full frames carry the tribes' words; the same object comes back between them.
  useEffect(() => {
    if (!world) return
    // A world that starts over (its tick goes back) takes a notice still waiting for an empty screen with it:
    // that split belongs to the old world.
    if (world.tick < lastTick.current) setSplit(null)
    lastTick.current = world.tick
    if (!world.lineage_words || world.lineage_words === seenWords.current) return
    seenWords.current = world.lineage_words
    if (alreadyShown(worldKey())) return
    watch.current ??= new WordSplitWatch()
    const found = watch.current.update(world)
    if (found) setSplit(found)
  }, [world])

  useEffect(() => {
    if (!split) return
    let timer = 0
    const show = () => {
      if (screenBusy()) {
        timer = window.setTimeout(show, TOAST_RETRY_MS)
        return
      }
      remember(worldKey())
      setVisible(true)
      timer = window.setTimeout(() => setVisible(false), WORD_SPLIT_SHOW_MS)
    }
    show()
    return () => window.clearTimeout(timer)
  }, [split])

  if (!split || !visible) return null
  const name = (lineage: string) => world?.lineage_names?.[lineage] ?? lineage.slice(0, 6)
  return (
    <div className="desktop-toast word-split-toast" role="status" aria-live="polite">
      <button
        type="button"
        className="desktop-toast-close"
        aria-label={t('dialogs.toast.dismiss')}
        onClick={() => setVisible(false)}
      >
        ×
      </button>
      <div className="desktop-toast-title">{t('model.wordSplit.title')}</div>
      <div className="desktop-toast-sub">
        {t('model.wordSplit.text', {
          first: name(split.first),
          second: name(split.second),
          concept: split.concept,
          firstWord: split.firstWord,
          secondWord: split.secondWord,
        })}
      </div>
    </div>
  )
}
