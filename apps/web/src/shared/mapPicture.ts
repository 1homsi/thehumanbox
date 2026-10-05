import { cfFlag } from '../game/render/cf/flags'
import { captureCanvas } from '../game/render/cf/capture'

/** A file name for a picture of the world: "the-human-box-tick-12000.png". */
export function pictureName(tick: number | undefined): string {
  const t = Number.isFinite(tick) ? Math.max(0, Math.floor(tick as number)) : 0
  return `the-human-box-tick-${t}.png`
}

/** The biggest canvas on the map, where the world is drawn. */
export function findMapCanvas(root: ParentNode = document): HTMLCanvasElement | null {
  const canvases = [...root.querySelectorAll<HTMLCanvasElement>('.map2d-world canvas')]
  if (canvases.length === 0) return null
  return canvases.reduce((best, c) => (c.width * c.height > best.width * best.height ? c : best))
}

/**
 * Save the map as a PNG. Resolves false when there is no map to save or the
 * browser refuses to encode it.
 */
export async function saveMapPicture(
  tick: number | undefined,
  root: ParentNode = document,
): Promise<boolean> {
  const canvas = findMapCanvas(root)
  if (!canvas) return false
  // `?cf=picture`: read the engine's canvas in the frame that drew it (a WebGL
  // canvas read between frames comes out black).
  const blob = cfFlag('picture')
    ? await captureCanvas(canvas)
    : await new Promise<Blob | null>((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/png')
        } catch {
          resolve(null)
        }
      })
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = pictureName(tick)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}
