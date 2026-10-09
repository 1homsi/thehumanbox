/**
 * A picture of a xipjs canvas.
 *
 * The engine draws with WebGL and does not keep the drawing buffer, so
 * `canvas.toBlob()` called between frames reads a cleared buffer: an
 * all-black PNG (what "save a picture of the world" produced). The buffer is
 * readable only in the same task that drew it. So: wake the engine's sleeping
 * loop (it listens for pointer input on its canvas), let it queue its frame,
 * queue ours right behind it, and read the canvas from there.
 *
 * Best handled by the engine (a `captureFrame()` or a `preserveDrawingBuffer`
 * option); this is the workaround until it is.
 */
export function captureCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      // Not bubbling: only the engine's own listeners hear it.
      canvas.dispatchEvent(new Event('pointermove'))
    } catch {
      /* fall through: the next frame may come anyway */
    }
    requestAnimationFrame(() => {
      try {
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      } catch {
        resolve(null)
      }
    })
  })
}
