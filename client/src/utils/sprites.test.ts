import { afterAll, beforeAll, expect, it, vi } from 'vitest'
let drawPeopleTile: typeof import('./sprites').drawPeopleTile
let getPeopleAtlas: typeof import('./sprites').getPeopleAtlas
let peopleImage: typeof import('./sprites').ATLAS_PEOPLE
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
  ;({ drawPeopleTile, getPeopleAtlas, ATLAS_PEOPLE: peopleImage } = await import('./sprites'))
})

it('shares a prepared atlas within a frame and rechecks loading and replacement on the next frame', () => {
  const atlas = getPeopleAtlas()
  expect(atlas).not.toBeNull()
  const ctx = { drawImage: vi.fn(), imageSmoothingEnabled: false }
  Object.defineProperty(peopleImage, 'complete', { value: false, configurable: true })
  // A prepared pass does not touch the image's DOM properties per resident.
  expect(drawPeopleTile(ctx as unknown as CanvasRenderingContext2D, [0, 0], 1, 2, 24, false, atlas)).toBe(
    true,
  )
  expect(ctx.drawImage.mock.calls[0][0]).toBe(atlas)
  expect(getPeopleAtlas()).toBeNull()
  expect(drawPeopleTile(ctx as unknown as CanvasRenderingContext2D, [0, 0], 1, 2, 24, false, null)).toBe(
    false,
  )
  Object.defineProperty(peopleImage, 'complete', { value: true, configurable: true })
  peopleImage.src = 'replacement-people.svg'
  expect(getPeopleAtlas()).not.toBe(atlas)
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
