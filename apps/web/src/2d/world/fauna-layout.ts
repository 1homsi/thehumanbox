export const FAUNA_ATLAS_WIDTH = 1774
export const FAUNA_ATLAS_HEIGHT = 887

// Measured opaque bounds in the original atlas. These intentionally do not
// assume equal cells: antlers, tails and ears must never be clipped.
export const FAUNA_RECTS = {
  rabbit: [87, 109, 279, 308],
  deer: [485, 18, 360, 419],
  boar: [926, 127, 416, 309],
  bird: [1434, 214, 273, 223],
  wolf: [22, 510, 428, 318],
  dog: [478, 525, 389, 306],
  fish: [940, 578, 413, 207],
  goldBird: [1435, 597, 272, 224],
} as const

export function faunaRect(kind: string, id: number): readonly [number, number, number, number] | null {
  if (kind === 'bird') return id % 2 === 0 ? FAUNA_RECTS.bird : FAUNA_RECTS.goldBird
  return FAUNA_RECTS[kind as keyof typeof FAUNA_RECTS] ?? null
}
