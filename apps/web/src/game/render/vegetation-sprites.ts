import { loadAtlas } from '../../shared/sprites'
import { FOREST, GRASS, INK, SAND, SNOW, hex, type Rgb } from './art-palette'

// Local trunk and autumn foliage tones beyond art-palette.ts.
const BARK_LIT: Rgb = [142, 102, 66]
const BARK_MID: Rgb = [110, 77, 48]
const BARK_SHADE: Rgb = [78, 54, 34]
const AUTUMN_RED_LIT: Rgb = [196, 104, 62]
const AUTUMN_RED_MID: Rgb = [168, 74, 44]
const AUTUMN_RED_SHADE: Rgb = [118, 48, 30]
const AUTUMN_GOLD_LIT: Rgb = [214, 174, 78]
const AUTUMN_GOLD_MID: Rgb = [184, 138, 54]
const AUTUMN_GOLD_SHADE: Rgb = [138, 96, 36]
const BIRCH_KNOT: Rgb = [133, 123, 105]

export const VEGETATION_ATLAS_WIDTH = 100
export const VEGETATION_ATLAS_HEIGHT = 40

const PALETTE: Record<string, string> = {
  k: hex(INK),
  L: hex(FOREST.light),
  M: hex(FOREST.mid),
  D: hex(FOREST.dark),
  g: hex(GRASS.light),
  G: hex(GRASS.lush),
  w: hex(SNOW.lit),
  s: hex(SAND.light),
  m: hex(BIRCH_KNOT),
  t: hex(BARK_LIT),
  T: hex(BARK_MID),
  b: hex(BARK_SHADE),
  r: hex(AUTUMN_RED_LIT),
  R: hex(AUTUMN_RED_MID),
  q: hex(AUTUMN_RED_SHADE),
  y: hex(AUTUMN_GOLD_LIT),
  Y: hex(AUTUMN_GOLD_MID),
  u: hex(AUTUMN_GOLD_SHADE),
}

interface SpriteDef {
  readonly sx: number
  readonly sy: number
  readonly rows: readonly string[]
}

const SPRITE_DEFS: Record<string, SpriteDef> = {
  // Broad green oak (17x17)
  '3,0': {
    sx: 1,
    sy: 1,
    rows: [
      '.....kkkkkkk.....',
      '...kkLLLLLLLkk...',
      '..kLLLLLLLLLMMk..',
      '.kLLLLLLLLLMMMMk.',
      '.kLLLLLLLMMMMMMk.',
      'kLLLLLLMMMMMMMMMk',
      'kLLLLLMMMMMMMMMMk',
      'kLLLLMMMMMMMMMDDk',
      'kLLLMMMMMMMMDDDDk',
      'kLLMMMMMMMDDDDDDk',
      'kLMMMMMMDDDDDDDDk',
      '.kMMMMMDDDDDDDDk.',
      '.kkDDDDDDDDDDDkk.',
      '...kkkkkTTbkkk...',
      '......ktTTbk.....',
      '......ktTTbk.....',
      '.....kktTTbkk....',
    ],
  },
  // Dense dark oak (18x18)
  '4,0': {
    sx: 21,
    sy: 1,
    rows: [
      '.....kkkkkkkk.....',
      '...kkLLLLLLLLkk...',
      '..kLLLLLLLLLLMMk..',
      '.kLLLLLLLLMMMMMMk.',
      '.kLLLLLLMMMMMMMMk.',
      'kLLLLLMMMMMMMMMMMk',
      'kLLLLMMMMMMMMMMMMk',
      'kLLLMMMMMMMMMMMDDk',
      'kLLLMMMMMMMMDDDDDk',
      'kLLMMMMMMMDDDDDDDk',
      'kLMMMMMMMDDDDDDDDk',
      'kMMMMMMMDDDDDDDDDk',
      '.kMMMMDDDDDDDDDDk.',
      '.kkDDDDDDDDDDDDkk.',
      '...kkkkktTTbkkk...',
      '......ktTTTbk.....',
      '......ktTTTbk.....',
      '.....kktTTTbkk....',
    ],
  },
  // Evergreen pine (16x18)
  '5,0': {
    sx: 42,
    sy: 1,
    rows: [
      '.......kk.......',
      '......kLMk......',
      '.....kLLMMk.....',
      '....kLLLMMDk....',
      '...kLLLLMMMDk...',
      '..kLLLLMMMMDDk..',
      '..kLLLMMMMDDDDk.',
      '.kLLLLLMMMMMDDk.',
      '.kLLLLMMMMMDDDk.',
      'kLLLLLMMMMDDDDDk',
      'kLLLLMMMMDDDDDDk',
      'kLLLLLMMMMDDDDDk',
      'kLLLLMMMMMDDDDDk',
      'kLLLMMMMMDDDDDDk',
      'kLLMMMMDDDDDDDDk',
      '.kkDDDDDDDDDDkk.',
      '....kkkTTbkkk...',
      '.....kkkkkkk....',
    ],
  },
  // Dark boreal pine (14x17)
  '6,0': {
    sx: 63,
    sy: 1,
    rows: [
      '......kk......',
      '.....kLMk.....',
      '....kLLMMk....',
      '...kLLLMMDk...',
      '..kLLLMMMMDk..',
      '..kLLMMMMDDDk.',
      '.kLLLLMMMMDDk.',
      '.kLLLMMMMDDDDk',
      'kLLLLMMMMDDDDk',
      'kLLLMMMMDDDDDk',
      'kLLLLMMMDDDDDk',
      'kLLLMMMMDDDDDk',
      'kLLMMMMDDDDDDk',
      '.kDDDDDDDDDDk.',
      '...kkkTTbkkk..',
      '....ktTTbk....',
      '....kkkkkk....',
    ],
  },
  // White-trunk birch (15x17)
  '2,0': {
    sx: 82,
    sy: 1,
    rows: [
      '....kkkkkkk....',
      '..kkgggggggkk..',
      '.kggggggggLLLk.',
      '.kgggggggLLLLk.',
      'kggggggLLLLLLLk',
      'kgggggLLLLLLMMk',
      'kggggLLLLLLMMMk',
      'kgggLLLLLLMMMMk',
      'kggLLLLLMMMMMMk',
      '.kLLLLMMMMMMMMk',
      '.kLLLMMMMMMMMk.',
      '..kkMMMMMMMkk..',
      '....kkwwwsk....',
      '.....kwwmsk....',
      '.....kwwssk....',
      '.....kmwssk....',
      '....kkwwsskk...',
    ],
  },
  // Autumn red oak (17x17)
  '7,0': {
    sx: 1,
    sy: 21,
    rows: [
      '.....kkkkkkk.....',
      '...kkrrrrrrrkk...',
      '..krrrrrrrrrRRk..',
      '.krrrrrrrrrRRRRk.',
      '.krrrrrrrRRRRRRk.',
      'krrrrrrRRRRRRRRRk',
      'krrrrrRRRRRRRRRRk',
      'krrrrRRRRRRRRRqqk',
      'krrrRRRRRRRRqqqqk',
      'krrRRRRRRRqqqqqqk',
      'krRRRRRRqqqqqqqqk',
      '.kRRRRRqqqqqqqqk.',
      '.kkqqqqqqqqqqqkk.',
      '...kkkkkTTbkkk...',
      '......ktTTbk.....',
      '......ktTTbk.....',
      '.....kktTTbkk....',
    ],
  },
  // Autumn golden oak (17x17)
  '8,0': {
    sx: 21,
    sy: 21,
    rows: [
      '.....kkkkkkk.....',
      '...kkyyyyyyykk...',
      '..kyyyyyyyyyYYk..',
      '.kyyyyyyyyyYYYYk.',
      '.kyyyyyyyYYYYYYk.',
      'kyyyyyyYYYYYYYYYk',
      'kyyyyyYYYYYYYYYYk',
      'kyyyyYYYYYYYYYuuk',
      'kyyyYYYYYYYYuuuuk',
      'kyyYYYYYYYuuuuuuk',
      'kyYYYYYYuuuuuuuuk',
      '.kYYYYYuuuuuuuuk.',
      '.kkuuuuuuuuuuukk.',
      '...kkkkkTTbkkk...',
      '......ktTTbk.....',
      '......ktTTbk.....',
      '.....kktTTbkk....',
    ],
  },
  // Bare winter / dead tree (12x14)
  '11,0': {
    sx: 44,
    sy: 23,
    rows: [
      '..kk....kk..',
      '.ktk...ktk..',
      '.ktk..ktbk..',
      '..ktk.ktk...',
      '..ktkkTbk...',
      '...ktTbk.kk.',
      '.kkktTbkktk.',
      'ktTktTbktbk.',
      '.kkkktTbkk..',
      '....ktTbk...',
      '....ktTbk...',
      '....ktTbk...',
      '...kktTbkk..',
      '...kkkkkkk..',
    ],
  },
  // Desert saguaro cactus (8x10)
  '10,0': {
    sx: 66,
    sy: 25,
    rows: [
      '...kk...',
      '.kkkLk..',
      'kgkgDk..',
      'kgkLDkkk',
      'kgLLDkLk',
      '.kkkLLDk',
      '..kgLDDk',
      '..kgLDk.',
      '..kgLDk.',
      '..kkkkk.',
    ],
  },
  // Low leafy shrub (7x6)
  '4,1': {
    sx: 86,
    sy: 27,
    rows: ['..kkk..', '.kLLMk.', 'kLLLMMk', 'kLLMMDk', 'kMMDDDk', '.kkkkk.'],
  },
}

const atlas = loadAtlas(`${import.meta.env.BASE_URL}sprites/vegetation.png`)

const crops: Record<string, readonly [number, number, number, number]> = Object.fromEntries(
  Object.entries(SPRITE_DEFS).map(([key, def]) => [
    key,
    [def.sx, def.sy, def.rows[0].length, def.rows.length] as const,
  ]),
)

const defByCoord = new Map<string, SpriteDef>(
  Object.values(SPRITE_DEFS).map((def) => [`${def.sx},${def.sy}`, def]),
)

let bakedAtlas: HTMLCanvasElement | null | undefined
function getBakedAtlas(): HTMLCanvasElement | null {
  if (bakedAtlas !== undefined) return bakedAtlas
  if (typeof document === 'undefined') {
    bakedAtlas = null
    return null
  }
  const c = document.createElement('canvas')
  c.width = VEGETATION_ATLAS_WIDTH
  c.height = VEGETATION_ATLAS_HEIGHT
  const ctx = c.getContext('2d')
  if (!ctx) {
    bakedAtlas = null
    return null
  }
  for (const def of Object.values(SPRITE_DEFS)) {
    for (let y = 0; y < def.rows.length; y++) {
      const row = def.rows[y]
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]
        if (ch === '.') continue
        ctx.fillStyle = PALETTE[ch]
        ctx.fillRect(def.sx + x, def.sy + y, 1, 1)
      }
    }
  }
  bakedAtlas = c
  return bakedAtlas
}

// Sprite tiles are shared constant tuples, so their crop is looked up once per tuple
// instead of joining a key string for every tree on every frame.
const cropByTile = new WeakMap<readonly [number, number], readonly [number, number, number, number] | null>()
function cropFor(tile: readonly [number, number]) {
  let crop = cropByTile.get(tile)
  if (crop === undefined) {
    crop = crops[tile.join(',')] ?? null
    cropByTile.set(tile, crop)
  }
  return crop
}

/** Where and how large a vegetation sprite lands for a tree box of `size` at (x, y). */
export interface VegetationPlacement {
  /** Source rectangle in the vegetation atlas. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Destination, in whole pixels. */
  dx: number
  dy: number
  width: number
  height: number
}

export function vegetationPlacement(
  tile: readonly [number, number],
  x: number,
  y: number,
  size: number,
): VegetationPlacement | null {
  const crop = cropFor(tile)
  if (!crop) return null
  const [sx, sy, sw, sh] = crop
  const width = sw
  const height = sh
  return {
    sx,
    sy,
    sw,
    sh,
    dx: Math.round(x + (size - width) / 2),
    dy: Math.round(y + size * 0.88 - height),
    width,
    height,
  }
}

export function vegetationAtlasReady(): boolean {
  return (atlas.complete && atlas.naturalWidth > 0) || getBakedAtlas() !== null
}

/** Draw a vegetation sprite's pixels into a canvas at its 1:1 native pixel size. */
export function drawVegetationCrop(ctx: CanvasRenderingContext2D, p: VegetationPlacement, x = 0, y = 0) {
  const src = atlas.complete && atlas.naturalWidth > 0 ? atlas : getBakedAtlas()
  if (src) {
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, p.sx, p.sy, p.sw, p.sh, x, y, p.width, p.height)
    ctx.restore()
    return
  }
  const def = defByCoord.get(`${p.sx},${p.sy}`)
  if (!def) return
  for (let rowIdx = 0; rowIdx < def.rows.length; rowIdx++) {
    const row = def.rows[rowIdx]
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const ch = row[colIdx]
      if (ch === '.') continue
      ctx.fillStyle = PALETTE[ch]
      ctx.fillRect(x + colIdx, y + rowIdx, 1, 1)
    }
  }
}

export function drawVegetationSprite(
  ctx: CanvasRenderingContext2D,
  tile: readonly [number, number],
  x: number,
  y: number,
  size: number,
): boolean {
  const p = vegetationPlacement(tile, x, y, size)
  if (!p) return false
  drawVegetationCrop(ctx, p, p.dx, p.dy)
  return true
}
