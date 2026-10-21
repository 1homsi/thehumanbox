import { FOREST, GRASS, INK, SNOW, hex, type Rgb } from './art-palette'

// Tones beyond art-palette.ts. Each crown has a ramp from the leaves catching the light to the deep shade
// between them, so overlapping trees read as a canopy with volume rather than flat discs.
const LEAF_HIGHLIGHT: Rgb = [146, 164, 84]
const LEAF_DEEP: Rgb = [42, 58, 36]
const PINE: readonly Rgb[] = [
  [96, 128, 88],
  [70, 100, 70],
  [50, 76, 56],
  [34, 54, 42],
]
const BIRCH: readonly Rgb[] = [
  [170, 178, 96],
  [140, 152, 78],
  [108, 124, 62],
  [78, 94, 48],
]
const AUTUMN_RED: readonly Rgb[] = [
  [222, 140, 84],
  [196, 104, 62],
  [168, 74, 44],
  [118, 48, 30],
  [84, 34, 24],
]
const AUTUMN_GOLD: readonly Rgb[] = [
  [236, 204, 110],
  [214, 174, 78],
  [184, 138, 54],
  [138, 96, 36],
  [98, 66, 28],
]
const BARK_LIT: Rgb = [142, 102, 66]
const BARK_MID: Rgb = [110, 77, 48]
const BARK_SHADE: Rgb = [78, 54, 34]
const BIRCH_MARK: Rgb = [60, 53, 46]

export const VEGETATION_ATLAS_WIDTH = 100
export const VEGETATION_ATLAS_HEIGHT = 37

/** One letter per pixel. The crowns are generated (clumps lit from the top-left), the rest drawn by hand. */
const PALETTE: Record<string, string> = {
  k: hex(INK),
  H: hex(LEAF_HIGHLIGHT),
  L: hex(FOREST.light),
  M: hex(FOREST.mid),
  D: hex(FOREST.dark),
  X: hex(LEAF_DEEP),
  ...ramp('1234', PINE),
  ...ramp('5678', BIRCH),
  ...ramp('arRqQ', AUTUMN_RED),
  ...ramp('eyYuU', AUTUMN_GOLD),
  g: hex(GRASS.light),
  G: hex(GRASS.lush),
  w: hex(SNOW.lit),
  m: hex(BIRCH_MARK),
  t: hex(BARK_LIT),
  T: hex(BARK_MID),
  b: hex(BARK_SHADE),
}

function ramp(letters: string, tones: readonly Rgb[]): Record<string, string> {
  return Object.fromEntries([...letters].map((ch, i) => [ch, hex(tones[i])]))
}

interface SpriteDef {
  readonly sx: number
  readonly sy: number
  readonly rows: readonly string[]
}

const SPRITE_DEFS: Record<string, SpriteDef> = {
  // Broad green oak (15x17)
  '3,0': {
    sx: 1,
    sy: 1,
    rows: [
      '.....kkkkk.....',
      '....kHHHLDkkk..',
      '..kkHMMMDHLLLk.',
      '.kHHHLLHHLLLDMk',
      'kHHHLHHLLMLDMDk',
      'kHMMMHLLMMDMDDk',
      'kMHHLMMDDXXXXXk',
      'kHHLLHHLLMLLMXk',
      'kHLLHHLLMMDMDDk',
      'kLLMHLLMMDDXXXk',
      'kLDMLLMMDDXDXXk',
      'kDDXLMMXDXXXXXk',
      '.kkXXMDDXXXXXk.',
      '...kkXbbbkkkk..',
      '.....ktTbk.....',
      '....kttTbbk....',
      '.....kkkkk.....',
    ],
  },
  // Dense dark oak (18x17)
  '4,0': {
    sx: 17,
    sy: 1,
    rows: [
      '......kkkkkkkk....',
      '...kkkDLLMDXLMkk..',
      '..kLLLLDDDDLLMDXk.',
      '.kLLLLMMLLMDMXDDk.',
      '.kLLLMLLLLMDXDDXXk',
      'kDLLDDLLDDXDXDXXXk',
      '.kXDLLDDLLMXXXXXXk',
      '.kLLLMLLMMDDMMDDk.',
      '.kLLMMLMMDDDXDDXXk',
      'kDLMMLMMDDDXXDXXXk',
      '.kMMDLMDDDXXXXXXXk',
      '.kDDDMDDXXXXXXXXXk',
      '..kXXXXDXXXXXXXXk.',
      '...kkkkXbbbXkkkk..',
      '.......ktTbk......',
      '......kttTbbk.....',
      '.......kkkkk......',
    ],
  },
  // Evergreen pine (11x17)
  '5,0': {
    sx: 36,
    sy: 1,
    rows: [
      '.....k.....',
      '....k3k....',
      '....k3k....',
      '...k144k...',
      '...k134k...',
      '..k13344k..',
      '..k21444k..',
      '..k13344k..',
      '..k21344k..',
      '.k1123344k.',
      'k221233444k',
      '.k1123344k.',
      'k112233344k',
      'k223344444k',
      '.kkkTbkkkk.',
      '...kTbk....',
      '....kk.....',
    ],
  },
  // Dark boreal pine (11x16)
  '6,0': {
    sx: 48,
    sy: 1,
    rows: [
      '....kk.....',
      '...k24k....',
      '...k44k....',
      '..k2244k...',
      '..k334k....',
      '..k2444k...',
      '.k333444k..',
      '..k24444k..',
      '.k232444k..',
      '.k323444k..',
      'k3223444k..',
      'k22334444k.',
      'k344444444k',
      '.kkkTbkkkk.',
      '...kTbk....',
      '....kk.....',
    ],
  },
  // White-trunk birch (13x17)
  '2,0': {
    sx: 60,
    sy: 1,
    rows: [
      '.....kkk.....',
      '....k556k....',
      '...k77678kk..',
      '..k55677667k.',
      '.k5566567778k',
      'k55655567888k',
      'k76778678888k',
      '.k756588667k.',
      '.k5667865788k',
      '.k5688867888k',
      '.k7788878888k',
      '..k88wm8888k.',
      '...kkwwkkkk..',
      '....kwmk.....',
      '....kwmk.....',
      '....kwwk.....',
      '.....kk......',
    ],
  },
  // Autumn red oak (15x17)
  '7,0': {
    sx: 74,
    sy: 1,
    rows: [
      '.....kkkkk.....',
      '....kaaarRkkk..',
      '..kkaRRRRarrrk.',
      '.kaaarraarrrRRk',
      'kaaaaaarrRrRRqk',
      'kaRRRarrRRqRqqk',
      'kRaarqRqqQQQQQk',
      'kaaraaarrRrrRQk',
      'karraarrRRqRqqk',
      'krrRarrRRqqqqQk',
      'krRqrrRRqqQqQQk',
      'kqqqrqRqqQQQQQk',
      '.kkQqqqqQQQQQk.',
      '...kkQbbbkkkk..',
      '.....ktTbk.....',
      '....kttTbbk....',
      '.....kkkkk.....',
    ],
  },
  // Autumn golden oak (15x17)
  '8,0': {
    sx: 1,
    sy: 19,
    rows: [
      '.....kkkkk.....',
      '....keeeyYkkk..',
      '..kkeYYYYeyyek.',
      '.keeeyyeeyyyYYk',
      'keeeyeeyyYyYuuk',
      'keYYYeyyYYuYuuk',
      'kYeeyYYuuUUUUUk',
      'keeyyeeeyYyyYUk',
      'keyyeeyyYYuuuUk',
      'kyyYeyyYYuUuuUk',
      'kyYYeyYYuUUuUUk',
      'kuuuyYYuuUUUUUk',
      '.kkUuYuuUUUUUk.',
      '...kkUbbbkkkk..',
      '.....ktTbk.....',
      '....kttTbbk....',
      '.....kkkkk.....',
    ],
  },
  // Bare winter / dead tree (12x14)
  '11,0': {
    sx: 17,
    sy: 19,
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
    sx: 30,
    sy: 19,
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
    sx: 39,
    sy: 19,
    rows: ['...kk..', '.kkHHk.', 'kHLMMMk', 'kLMDXXk', 'kDXXXXk', '.kkkkk.'],
  },
}

const crops: Record<string, readonly [number, number, number, number]> = Object.fromEntries(
  Object.entries(SPRITE_DEFS).map(([key, def]) => [
    key,
    [def.sx, def.sy, def.rows[0].length, def.rows.length] as const,
  ]),
)

const defByCoord = new Map<string, SpriteDef>(
  Object.values(SPRITE_DEFS).map((def) => [`${def.sx},${def.sy}`, def]),
)

/** The atlas is drawn from the grids above once, so there is no image file to fall out of step with them. */
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
  return getBakedAtlas() !== null
}

/** Draw a vegetation sprite's pixels into a canvas at its 1:1 native pixel size. */
export function drawVegetationCrop(ctx: CanvasRenderingContext2D, p: VegetationPlacement, x = 0, y = 0) {
  const src = getBakedAtlas()
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
