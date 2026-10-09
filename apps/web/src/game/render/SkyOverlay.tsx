import { useEffect, useState } from 'react'
import { SKY_OVERLAY_MS, skyOverlayStrength, useSkyOverlay } from './sky-overlay'

/**
 * The sky over the map while an eclipse or an aurora runs: a dark disc and shadow for the eclipse,
 * drifting green and violet light for the aurora. It fades in and out and is gone when its time is up.
 */
export function SkyOverlay() {
  const kind = useSkyOverlay((s) => s.kind)
  const startedAt = useSkyOverlay((s) => s.startedAt)
  const clear = useSkyOverlay((s) => s.clear)
  const [, tick] = useState(0)

  useEffect(() => {
    if (kind === null) return
    const id = window.setInterval(() => {
      if (Date.now() - startedAt >= SKY_OVERLAY_MS[kind]) clear()
      tick((n) => n + 1)
    }, 250)
    return () => window.clearInterval(id)
  }, [kind, startedAt, clear])

  if (kind === null) return null
  const strength = skyOverlayStrength(Date.now() - startedAt, SKY_OVERLAY_MS[kind])
  if (strength <= 0) return null
  return (
    <div className={`sky-overlay sky-overlay-${kind}`} style={{ opacity: strength }} aria-hidden="true" />
  )
}
