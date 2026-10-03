import { useEffect, useState } from 'react'
import { useUIStore, useViewFlag } from '../../state/store'

// Long enough to read, short enough to stay out of the screenshot.
const VISIBLE_MS = 2500

/**
 * The way out of photo mode. Every other control is hidden, so this shows
 * when photo mode starts and whenever the pointer moves, then fades away.
 */
export function PhotoModeExit() {
  const photoMode = useViewFlag('photoMode')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!photoMode) return
    let timer = 0
    const wake = () => {
      setVisible(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setVisible(false), VISIBLE_MS)
    }
    wake()
    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('pointerdown', wake, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
    }
  }, [photoMode])

  if (!photoMode) return null
  return (
    <button
      type="button"
      className={`photo-mode-exit${visible ? ' visible' : ''}`}
      onClick={() => useUIStore.getState().setViewFlag('photoMode', false)}
    >
      exit photo mode <kbd>Esc</kbd>
    </button>
  )
}
