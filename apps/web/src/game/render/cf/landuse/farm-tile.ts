import { TILE } from '../../../model/palette'

/**
 * How a crop looks in the field. Each family has its own silhouette so a village
 * reads as more than one colour: grain heads, flooded paddy shoots, tall maize,
 * potato mounds, climbing beans, cotton tufts, broad tobacco leaves, cane
 * stalks and shrubs (coffee, tea).
 */
export type CropStyle = 'grain' | 'paddy' | 'stalk' | 'mound' | 'vine' | 'tuft' | 'leaf' | 'cane' | 'shrub'

const STYLE: Record<string, CropStyle> = {
  wheat: 'grain',
  barley: 'grain',
  rice: 'paddy',
  maize: 'stalk',
  potato: 'mound',
  beans: 'vine',
  cotton: 'tuft',
  tobacco: 'leaf',
  sugarcane: 'cane',
  coffee: 'shrub',
  tea: 'shrub',
}

export function farmCropStyle(crop: string | undefined): CropStyle {
  return STYLE[crop?.toLowerCase() ?? ''] ?? 'grain'
}

/** Bits for the sides of a field tile that face open ground (no field next to it). */
export const EDGE_TOP = 1
export const EDGE_RIGHT = 2
export const EDGE_BOTTOM = 4
export const EDGE_LEFT = 8

/** Everything a field tile's picture depends on. The atlas keys on it, so equal looks bake once. */
export interface FarmLook {
  /** fallow | seeded | growing | mature (see `farmStage`). */
  stage: string
  /** Growth from 0 to 1. */
  progress: number
  cropColor: string
  crop: string
  /** 0 or 1: staggers the rows so neighbouring fields do not repeat. */
  variant: number
  /** The world's season: recovery (spring), abundance (summer), decline (autumn), scarcity (winter). */
  season: string
  /** EDGE_* bits for the sides that face open ground. */
  edges: number
}

export function farmLookKey(look: FarmLook): string {
  return `F|${look.stage}|${Math.round(look.progress * 4)}|${look.crop}|${look.variant}|${look.season}|${look.edges}`
}

/**
 * One farm tile: furrowed soil, the crop in its style, a field edge on the open sides. Painted with
 * its top-left at (x, y); also used to bake the tile into a sprite atlas, so it must depend only on
 * its arguments.
 */
export function paintFarmTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: FarmLook,
  cropColor = look.cropColor,
) {
  const { stage, season, crop, variant, edges } = look
  const style = farmCropStyle(crop)
  const fill = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x + dx, y + dy, w, h)
  }
  const ripe = stage === 'mature'
  const fallow = stage === 'fallow'
  const winter = season === 'scarcity'
  const autumn = season === 'decline'
  const height = fallow ? 0 : Math.max(1, Math.round(1 + look.progress * 4))
  const offset = variant % 2

  // Soil. A planted field is dark tilled loam; a fallow one shows its season: bare furrows in spring
  // and summer, golden stubble after the autumn harvest, and snow over the ground in winter.
  if (style === 'paddy' && !fallow) {
    fill(0, 0, TILE, TILE, '#3f2c21')
    fill(0, 0, TILE, TILE, ripe ? '#c9b26a' : '#4f7f86')
    for (const row of [2, 5]) fill(0, row, TILE, 1, ripe ? '#b39a55' : '#3d6b72')
  } else {
    fill(0, 0, TILE, TILE, '#3a2719')
    fill(0, 0, TILE, TILE, fallow ? '#6b4c32' : '#5e4128')
    // Furrows: a dark cut and a lit ridge on every third row, so a field reads as rows.
    for (let row = 2; row < TILE - 1; row += 3) {
      fill(0, row, TILE, 1, ripe ? '#b98b45' : '#3a2719')
      fill(0, row + 1, TILE, 1, fallow ? '#8a6239' : '#7a5232')
    }
    if (fallow && autumn) {
      for (let row = 1; row < TILE; row += 3) {
        for (let c = 1 + offset; c < TILE - 1; c += 2) fill(c, row, 1, 2, '#c9a45c')
      }
    }
  }

  if (height > 0) {
    switch (style) {
      case 'grain':
        for (let c = 2 + offset; c < TILE - 1; c += 3) {
          fill(c, TILE - height - 1, 1, height, '#9dbb48')
          if (height >= 3) fill(c + 1, TILE - height, 1, 1, cropColor)
        }
        break
      case 'paddy':
        for (let c = 2 + offset; c < TILE - 1; c += 3) {
          fill(c, TILE - height - 1, 1, height, ripe ? '#e0c46a' : '#8fc26a')
        }
        break
      case 'stalk': {
        const tall = Math.min(TILE - 1, height + 2)
        for (let c = 2 + offset; c < TILE - 1; c += 3) {
          fill(c, TILE - tall - 1, 1, tall, '#6f9b3c')
          if (ripe) fill(c + 1, TILE - tall, 1, 2, cropColor)
        }
        break
      }
      case 'mound':
        for (const row of [3, 6]) {
          for (let c = 1 + offset; c < TILE - 2; c += 3) {
            fill(c, row - Math.min(height, 2), 2, Math.min(height, 2) + 1, '#4f7a3a')
            if (ripe) fill(c, row, 1, 1, '#8a6a3e')
          }
        }
        break
      case 'vine':
        for (const row of [2, 5]) {
          fill(1, row, TILE - 2, 1, '#4f8a3f')
          for (let c = 2 + offset; c < TILE - 1; c += 3) {
            fill(c, row - 1, 1, 1, '#6fae52')
            if (ripe) fill(c, row + 1, 1, 1, cropColor)
          }
        }
        break
      case 'tuft':
        for (let c = 1 + offset; c < TILE - 2; c += 3) {
          for (const row of [2, 5]) {
            fill(c, row, 2, 2, '#6aa04f')
            if (ripe) fill(c, row, 2, 1, cropColor)
          }
        }
        break
      case 'leaf':
        for (const row of [1, 4]) {
          for (let c = 1 + offset; c < TILE - 2; c += 3) {
            fill(c, row + (height > 2 ? 0 : 1), 2, 2, ripe ? '#a88a4a' : '#7f9a4a')
          }
        }
        break
      case 'cane':
        for (let c = 1 + offset; c < TILE - 1; c += 2) {
          const tall = Math.min(TILE - 1, height + 3)
          fill(c, TILE - tall - 1, 1, tall, '#5f8f3a')
          if (ripe) fill(c, TILE - tall - 1, 1, 1, cropColor)
        }
        break
      case 'shrub':
        for (const row of [2, 5]) {
          for (let c = 1 + offset; c < TILE - 2; c += 4) {
            fill(c, row, 3, 2, ripe ? '#4d7d43' : '#3e6b3a')
            if (ripe) fill(c + 1, row - 1, 1, 1, cropColor)
          }
        }
        break
    }
  }

  // Winter: snow lies on the ground and on the lower crop.
  if (winter) {
    fill(0, 0, TILE, 2, '#e6eef2')
    for (let c = 1 + offset; c < TILE - 1; c += 3) fill(c, 3, 1, 1, '#eef4f7')
  }

  // Field edges: a dark boundary on each side that faces open ground, so a field reads as a plot.
  const EDGE = '#2b1e14'
  if (edges & EDGE_TOP) fill(0, 0, TILE, 1, EDGE)
  if (edges & EDGE_BOTTOM) fill(0, TILE - 1, TILE, 1, EDGE)
  if (edges & EDGE_LEFT) fill(0, 0, 1, TILE, EDGE)
  if (edges & EDGE_RIGHT) fill(TILE - 1, 0, 1, TILE, EDGE)

  if (ripe) {
    ctx.fillStyle = 'rgba(255, 232, 145, 0.9)'
    ctx.fillRect(x, y, TILE, 1)
    ctx.fillRect(x, y + TILE - 1, TILE, 1)
    ctx.fillRect(x, y, 1, TILE)
    ctx.fillRect(x + TILE - 1, y, 1, TILE)
  }
}
