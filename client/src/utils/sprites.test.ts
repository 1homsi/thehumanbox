import { afterAll, beforeAll, expect, it, vi } from 'vitest'
let drawPeopleTile: typeof import('./sprites').drawPeopleTile
const canvases: { width: number; height: number; getContext: ReturnType<typeof vi.fn> }[] = []
beforeAll(async () => {
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      complete = true
      naturalWidth = 128
      naturalHeight = 1920
      addEventListener() {}
    },
  )
  vi.stubGlobal('document', {
    createElement: () => {
      const ctx = { drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn() }
      const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) }
      canvases.push(canvas)
      return canvas
    },
  })
  ;({ drawPeopleTile } = await import('./sprites'))
})
afterAll(() => vi.unstubAllGlobals())
it('draws mirrored atlas cells at unchanged world bounds and reuses the mirrored atlas', () => {
  const ctx = { drawImage: vi.fn(), imageSmoothingEnabled: true }
  drawPeopleTile(ctx as unknown as CanvasRenderingContext2D, [1, 2], 10, 20, 24, true)
  expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([64, 64, 32, 32, 10, 20, 24, 24])
  expect(ctx.imageSmoothingEnabled).toBe(true)
  const count = canvases.length
  drawPeopleTile(ctx as unknown as CanvasRenderingContext2D, [2, 2], 12, 20, 24, true)
  expect(canvases).toHaveLength(count)
  expect(ctx.drawImage.mock.calls[1].slice(1)).toEqual([32, 64, 32, 32, 12, 20, 24, 24])
  drawPeopleTile(ctx as unknown as CanvasRenderingContext2D, [1, 2], 10, 20, 24)
  expect(ctx.drawImage.mock.calls[2].slice(1)).toEqual([32, 64, 32, 32, 10, 20, 24, 24])
})
