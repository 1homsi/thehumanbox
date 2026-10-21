import { expect, it } from 'vitest'
import { buildPeopleLookAtlas } from './people-looks'

it('uses the authored palette and direction banks without allocating or recolouring an atlas', () => {
  const sheet = { width: 1280, height: 1920 } as HTMLCanvasElement
  expect(buildPeopleLookAtlas(sheet)).toBe(sheet)
})
