import { TILE } from '../../../model/palette'
import { shade } from '../../sprite-colors'

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
  /** Ruined by a blight, locusts, a flood or a dry spell: the crop stands dead until it is cut down. */
  withered?: boolean
  /** The plough that broke a field sown just now (an ox or a tractor), drawn in the furrows. */
  plough?: string | null
}

export function farmLookKey(look: FarmLook): string {
  return `F|${look.stage}|${Math.round(look.progress * 4)}|${look.crop}|${look.variant}|${look.season}|${look.edges}|${look.withered ? 'w' : ''}|${look.plough ?? ''}`
}

/**
 * Field tones. Every field is drawn from the same few ramps (tilled soil, leaf green, straw), so a farm
 * reads as one material next to the grass and the huts, not as a scatter of unrelated greens.
 */
const SOIL = { lit: '#8a6440', mid: '#6e4e30', furrow: '#4e3622' }
const FALLOW = { lit: '#9a7448', mid: '#7d5a38', furrow: '#5e4128' }
const LEAF = { lit: '#8f9c55', mid: '#6a8344', shade: '#4f6838' }
const STRAW = { lit: '#c8a668', mid: '#a6854c', shade: '#7d6236' }
const PADDY_WATER = { lit: '#7da39a', mid: '#608d84', shade: '#4d766f' }
const RICE_GOLD = { lit: '#ecc96e', mid: '#d6ae4e', shade: '#b88a36' }
const SNOW_FIELD = '#e6eae0'
const FIELD_EDGE = '#3a2a1c'

/**
 * One farm tile: furrowed soil and the crop in its style, in rows that run on unbroken from tile to tile
 * (every pattern repeats every 2 or 4 pixels, so a field of many tiles is one field, not a grid of
 * stamps). A ripe crop changes colour as a whole, gold grain or white cotton, so a ripe field reads at a
 * glance without a frame round every tile. Painted with its top-left at (x, y); also used to bake the tile
 * into a sprite atlas, so it must depend only on its arguments.
 */
export function paintFarmTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: FarmLook,
  cropColor = look.cropColor,
) {
  const { stage, season, crop, edges } = look
  const style = farmCropStyle(crop)
  // A ruined field is dead: every leaf goes straw-brown and nothing ripens.
  const withered = !!look.withered && stage !== 'fallow'
  const fill = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x + dx, y + dy, w, h)
  }
  const ripe = stage === 'mature' && !withered
  const fallow = stage === 'fallow'
  const winter = season === 'scarcity'
  const autumn = season === 'decline'
  // How many rows the crop stands above its furrow: 1 when just up, 3 when grown.
  const height = fallow ? 0 : Math.max(1, Math.min(3, Math.round(1 + look.progress * 2.4)))
  const leaf = withered ? STRAW : LEAF
  // The ripe colour of this crop, in three tones from its own colour.
  const ripeRamp = { lit: shade(cropColor, 1.18), mid: cropColor, shade: shade(cropColor, 0.74) }
  const drained = ripe || (autumn && look.progress >= 0.5)

  // Soil: the furrow line every fourth row, the ridge above it catching the light.
  const soil = fallow ? FALLOW : SOIL
  if (style === 'paddy' && !fallow && !drained) {
    fill(0, 0, TILE, TILE, PADDY_WATER.mid)
    for (const row of [3, 7]) fill(0, row, TILE, 1, PADDY_WATER.shade)
    for (const row of [0, 4]) fill(0, row, TILE, 1, PADDY_WATER.lit)
  } else {
    fill(0, 0, TILE, TILE, soil.mid)
    for (const row of [3, 7]) fill(0, row, TILE, 1, soil.furrow)
    for (const row of [0, 4]) fill(0, row, TILE, 1, soil.lit)
  }
  if (fallow && autumn) {
    // Golden stubble left after the harvest, along the ridges.
    for (const row of [1, 5]) for (let c = 0; c < TILE; c += 2) fill(c, row, 1, 2, STRAW.lit)
  }

  // Each crop row stands on a furrow line (rows 3 and 7) and grows up from it.
  const rows = [3, 7]
  const stand = (c: number, base: number, h: number, color: string) => fill(c, base - h, 1, h, color)
  if (height > 0) {
    switch (style) {
      case 'grain':
      case 'paddy':
        for (const base of rows) {
          for (let c = 0; c < TILE; c++) {
            const golden = ripe || (style === 'paddy' && drained)
            // Young grain stands in tufts with soil between; ripe grain closes into one gold sheet.
            if (c % 4 === 3 && !golden) continue
            if (golden) {
              const r = style === 'paddy' ? (ripe ? RICE_GOLD : STRAW) : ripeRamp
              stand(c, base, height, r.mid)
              fill(c, base - height, 1, 1, c % 4 === 0 ? r.lit : r.mid)
              fill(c, base - 1, 1, 1, r.shade)
            } else {
              stand(c, base, height, c % 2 ? leaf.mid : leaf.lit)
              if (height > 1) fill(c, base - 1, 1, 1, leaf.shade)
            }
          }
        }
        break
      case 'stalk':
        // Tall maize: one stalk every four pixels, leaves out to each side, a cob when ripe.
        for (let c = 1; c < TILE; c += 4) {
          const tall = height + 3
          stand(c, 7, tall, ripe ? STRAW.mid : leaf.mid)
          fill(c - 1, 7 - tall + 1, 1, 1, ripe ? STRAW.lit : leaf.lit)
          fill(c + 1, 7 - tall + 3, 1, 1, ripe ? STRAW.shade : leaf.shade)
          if (ripe) fill(c + 1, 7 - tall + 1, 1, 2, ripeRamp.lit)
        }
        break
      case 'mound':
        // Potato plants: low round bushes three wide along each row.
        for (const base of rows) {
          for (let c = 0; c < TILE; c += 4) {
            const h = Math.min(2, height)
            fill(c, base - h, 3, h, ripe ? STRAW.mid : leaf.mid)
            fill(c, base - h, 2, 1, ripe ? STRAW.lit : leaf.lit)
            fill(c + 2, base - 1, 1, 1, ripe ? STRAW.shade : leaf.shade)
          }
        }
        break
      case 'vine':
        // Beans climbing a line strung along each row, pods hanging when ripe.
        for (const base of rows) {
          fill(0, base - 2, TILE, 1, leaf.mid)
          for (let c = 0; c < TILE; c += 2) fill(c, base - 3, 1, 1, leaf.lit)
          if (ripe) for (let c = 1; c < TILE; c += 4) fill(c, base - 1, 1, 1, ripeRamp.mid)
        }
        break
      case 'tuft':
      case 'shrub':
        // Cotton and tea: bushes two wide; cotton opens white, coffee and tea show their berries.
        for (const base of rows) {
          for (let c = 0; c < TILE; c += 4) {
            const h = Math.min(2, height)
            fill(c, base - h, 3, h, leaf.mid)
            fill(c, base - h, 1, 1, leaf.lit)
            fill(c + 2, base - 1, 1, 1, leaf.shade)
            if (ripe) {
              fill(c, base - h - (style === 'tuft' ? 1 : 0), 2, 1, ripeRamp.lit)
              if (style === 'tuft') fill(c + 1, base - h, 1, 1, ripeRamp.mid)
            }
          }
        }
        break
      case 'leaf':
        // Tobacco: broad leaves, yellowing when ripe.
        for (const base of rows) {
          for (let c = 0; c < TILE; c += 4) {
            const h = Math.min(3, height + 1)
            const r = ripe ? ripeRamp : leaf
            fill(c, base - h, 3, h - 1, r.mid)
            fill(c, base - h, 2, 1, r.lit)
            fill(c + 1, base - 1, 1, 1, r.shade)
          }
        }
        break
      case 'cane':
        // Sugarcane: a dense stand of tall canes over the whole tile.
        for (let c = 0; c < TILE; c += 2) {
          const tall = Math.min(TILE - 1, height + 4)
          stand(c, 7, tall, ripe ? STRAW.mid : leaf.mid)
          fill(c, 7 - tall, 1, 1, ripe ? ripeRamp.lit : leaf.lit)
        }
        break
    }
  }

  // Winter: snow lies in the furrows between the rows.
  if (winter) for (const row of [0, 4]) fill(0, row, TILE, 1, SNOW_FIELD)

  // A field ends in a dark bank on each side that faces open ground, so a farm reads as one plot.
  if (edges & EDGE_TOP) fill(0, 0, TILE, 1, FIELD_EDGE)
  if (edges & EDGE_BOTTOM) fill(0, TILE - 1, TILE, 1, FIELD_EDGE)
  if (edges & EDGE_LEFT) fill(0, 0, 1, TILE, FIELD_EDGE)
  if (edges & EDGE_RIGHT) fill(TILE - 1, 0, 1, TILE, FIELD_EDGE)

  // The plough that broke a field just sown: an ox or a tractor standing in the furrows.
  if (look.plough) {
    for (const [dx, dy, color] of ploughPixels(look.plough)) fill(dx, dy, 1, 1, color)
  }
}

/** The ox is the village cart's ox (era-traffic.ts drawCart), so the two read as the same animal. */
const PLOUGH_COLORS: Record<string, string> = {
  b: '#a06c40',
  h: '#f2ead8',
  k: '#3a2a1a',
  g: '#3f7a3a',
  r: '#b8432f',
}

/** A 6 by 4 pixel ox (brown, pale head, dark hooves) or tractor (green body, red cab, black wheels). */
const PLOUGH_SHAPES: Record<string, readonly string[]> = {
  ox: ['....hh', 'bbbbbh', 'bbbbbb', 'k.k..k'],
  tractor: ['rr....', 'rgggg.', 'gggggg', 'k.kkk.'],
}

/** Where each pixel of the plough sits on the tile (one pixel in from the left, two down) and its colour. */
export function ploughPixels(plough: string): [number, number, string][] {
  const rows = PLOUGH_SHAPES[plough] ?? []
  const out: [number, number, string][] = []
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const color = PLOUGH_COLORS[row[c]!]
      if (color) out.push([1 + c, 2 + r, color])
    }
  })
  return out
}
