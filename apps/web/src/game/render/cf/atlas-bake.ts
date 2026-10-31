/**
 * Small texture atlases drawn once with Canvas2D and sampled by SpriteLayer
 * through dynamic canvases. Every atlas is a uniform grid because a layer atlas
 * is `frameWidth x frameHeight` cells indexed row-major.
 */
import { SPECIALTY_EMOJI } from '../draw-helpers'
import { BOAT_HULLS, drawBoatHull } from '../boat-sprite'
import { eraTier } from '../../model/era-tier'
import { drawPixelFauna, pixelFaunaDims, pixelFaunaKinds } from '../pixel-fauna'
import { FAUNA_RECTS } from '../fauna-layout'
import { animalSize } from '../animal-visuals'
import { EMOTES, drawEmote, type Emote } from '../activity-emotes'

// ---- Decals: white pixel shapes, tinted and scaled per sprite -----------------

export const DECAL_CELL = 32
export const DECAL = {
  disc: 0,
  ring: 1,
  diamond: 2,
  dashed: 3,
  /** The tribe's ring at a person's feet, made for 13 × 6. */
  footRing: 4,
  /** The selected person's ring and its dashes, made for 16 × 9. */
  selectRing: 5,
  selectDashed: 6,
} as const
export const DECAL_COLUMNS = 7
export const DECAL_SIZE = { width: DECAL_CELL * DECAL_COLUMNS, height: DECAL_CELL }

/** Whether the middle of pixel (i, j) of a w × h grid lies inside the ellipse that fills it. */
function insideEllipse(i: number, j: number, w: number, h: number): boolean {
  const x = (i + 0.5 - w / 2) / (w / 2)
  const y = (j + 0.5 - h / 2) / (h / 2)
  return x * x + y * y <= 1
}

/** The pixels of a w × h ellipse: filled, or only its one-pixel edge (dashed: every other run of three). */
export function ellipsePixels(w: number, h: number, shape: 'disc' | 'ring' | 'dashed'): [number, number][] {
  const out: [number, number][] = []
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!insideEllipse(i, j, w, h)) continue
      const edge =
        !insideEllipse(i - 1, j, w, h) ||
        !insideEllipse(i + 1, j, w, h) ||
        !insideEllipse(i, j - 1, w, h) ||
        !insideEllipse(i, j + 1, w, h)
      if (shape !== 'disc' && !edge) continue
      if (shape === 'dashed') {
        const turn = Math.atan2((j + 0.5 - h / 2) / h, (i + 0.5 - w / 2) / w) / (Math.PI * 2) + 0.5
        if (Math.floor(turn * 12) % 2 === 1) continue
      }
      out.push([i, j])
    }
  return out
}

/**
 * Paints a w × h pixel grid into decal cell `column`, each grid pixel a block of the 32-pixel cell. Drawn at
 * w × h with nearest sampling, every block lands on exactly one screen pixel: crisp, whole pixels like the
 * sprites, where a smooth circle shrunk down came out as a blurred vector ring.
 */
function paintGrid(
  ctx: CanvasRenderingContext2D,
  column: number,
  w: number,
  h: number,
  pixels: [number, number][],
) {
  const c = DECAL_CELL
  for (const [i, j] of pixels) {
    const x0 = Math.floor((i * c) / w)
    const x1 = Math.floor(((i + 1) * c) / w)
    const y0 = Math.floor((j * c) / h)
    const y1 = Math.floor(((j + 1) * c) / h)
    ctx.fillRect(column * c + x0, y0, x1 - x0, y1 - y0)
  }
}

export function bakeDecals(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, DECAL_SIZE.width, DECAL_SIZE.height)
  ctx.fillStyle = '#fff'
  // The free-sized shapes are drawn on a 16-pixel grid: whole pixels at their usual 16 to 22 pixels.
  paintGrid(ctx, DECAL.disc, 16, 16, ellipsePixels(16, 16, 'disc'))
  paintGrid(ctx, DECAL.ring, 16, 16, ellipsePixels(16, 16, 'ring'))
  const diamond: [number, number][] = []
  for (let j = 0; j < 16; j++)
    for (let i = 0; i < 16; i++) {
      const d = Math.abs(i - 7.5) + Math.abs(j - 7.5)
      if (d <= 7.5 && d > 6) diamond.push([i, j])
    }
  paintGrid(ctx, DECAL.diamond, 16, 16, diamond)
  paintGrid(ctx, DECAL.dashed, 16, 16, ellipsePixels(16, 16, 'dashed'))
  paintGrid(ctx, DECAL.footRing, 13, 6, ellipsePixels(13, 6, 'ring'))
  paintGrid(ctx, DECAL.selectRing, 16, 9, ellipsePixels(16, 9, 'ring'))
  paintGrid(ctx, DECAL.selectDashed, 16, 9, ellipsePixels(16, 9, 'dashed'))
}

// ---- Glyphs: emoji and a letter, baked at twice the size they are drawn -------

export const GLYPH_CELL = 16
export const GLYPH_COLUMNS = 8

/** Tool emoji `pickToolEmoji` can return. A test keeps this list in step with it. */
export const TOOL_EMOJI = [
  '\u{1F52B}',
  '\u{2694}\u{FE0F}',
  '\u{1F3F9}',
  '\u{1F4BB}',
  '\u{1F4D6}',
  '\u{1F528}',
  '\u{1F69C}',
]
export const SICK_EMOJI = '\u{1F912}'
export const DEGREE_EMOJI = '\u{1F393}'
/** The white cane an elder leans on. */
export const ELDER_CANE_EMOJI = '\u{1F9AF}'
export const SLEEP_GLYPH = 'z'
/** What a person carries home: a bundle of wood or a lump of stone (`carrying_type` 1 and 2). */
export const CARRY_WOOD_GLYPH = 'carry:wood'
export const CARRY_STONE_GLYPH = 'carry:stone'

export const GLYPHS: readonly string[] = Array.from(
  new Set([
    ...Object.values(SPECIALTY_EMOJI),
    ...TOOL_EMOJI,
    SICK_EMOJI,
    DEGREE_EMOJI,
    ELDER_CANE_EMOJI,
    SLEEP_GLYPH,
    CARRY_WOOD_GLYPH,
    CARRY_STONE_GLYPH,
  ]),
)
const glyphIndex = new Map(GLYPHS.map((g, i) => [g, i] as const))

export function glyphFrame(glyph: string): number {
  return glyphIndex.get(glyph) ?? -1
}

export const GLYPH_SIZE = {
  width: GLYPH_CELL * GLYPH_COLUMNS,
  height: GLYPH_CELL * Math.ceil(GLYPHS.length / GLYPH_COLUMNS),
}

/** Colours of the glyph icons: the map's warm ink, steel, wood and a few flat fills. */
const ICON_COLORS: Record<string, string> = {
  k: '#2b2117',
  s: '#8d949c',
  S: '#5f666e',
  W: '#9a6a3e',
  w: '#f2e6c8',
  g: '#7fbf5a',
  G: '#4c8a3a',
  b: '#6fb3e0',
  B: '#2f5f8a',
  R: '#b2453a',
  D: '#3a4560',
  y: '#e8c25a',
}

/**
 * The glyphs drawn over people and animals, as 8 × 8 pixel icons with the same ink outline as the sprites
 * under them. These were system emoji: smooth, glossy and in another style from everything around them.
 */
const PIXEL_ICONS: Record<string, readonly string[]> = {
  [SICK_EMOJI]: [
    '...kk...',
    '..kgGk..',
    '.kggGgk.',
    '.kgggGk.',
    'kgwgggGk',
    'kggggGGk',
    '.kgGGGk.',
    '..kkkk..',
  ],
  [DEGREE_EMOJI]: [
    '........',
    '...kk...',
    '.kkDDkk.',
    'kDDDDDDk',
    '.kkDDkky',
    '..kDDk.y',
    '..kkkk.y',
    '........',
  ],
  // rifle
  [TOOL_EMOJI[0]]: [
    '........',
    '........',
    'kkkkkkk.',
    'kSSSSSSk',
    'kWWkkkk.',
    'kWWk....',
    'kkk.....',
    '........',
  ],
  // sword
  [TOOL_EMOJI[1]]: [
    '......kk',
    '.....ksk',
    '....ksk.',
    '.k.ksk..',
    '.kksk...',
    '..kWk...',
    '.kWkk...',
    '.kk.....',
  ],
  // bow
  [TOOL_EMOJI[2]]: [
    '.kk.....',
    '.kWkk...',
    '..kWwk..',
    '...kWw..',
    '...kWw..',
    '..kWwk..',
    '.kWkk...',
    '.kk.....',
  ],
  // computer
  [TOOL_EMOJI[3]]: [
    '........',
    'kkkkkkkk',
    'kbbbbbbk',
    'kbwbbbbk',
    'kbbbbbbk',
    'kkkkkkkk',
    '...kk...',
    '.kkkkkk.',
  ],
  // book
  [TOOL_EMOJI[4]]: [
    '........',
    '.kkkkkk.',
    'kRRRRRRk',
    'kRwwwwRk',
    'kRRRRRRk',
    'kwwwwwwk',
    '.kkkkkk.',
    '........',
  ],
  // hammer
  [TOOL_EMOJI[5]]: [
    '.kkkkk..',
    'kssssSk.',
    'kssssSk.',
    '.kkWkk..',
    '..kWk...',
    '..kWk...',
    '..kWk...',
    '..kkk...',
  ],
  // hoe (the plough)
  [TOOL_EMOJI[6]]: [
    'kkkk....',
    'ksSk....',
    '.kkWk...',
    '...kWk..',
    '....kWk.',
    '.....kWk',
    '......kk',
    '........',
  ],
  [ELDER_CANE_EMOJI]: [
    '..kkk...',
    '.kWWWk..',
    '.kWkkWk.',
    '.kk.kWk.',
    '....kWk.',
    '....kWk.',
    '....kWk.',
    '....kkk.',
  ],
  [CARRY_WOOD_GLYPH]: [
    '........',
    '........',
    '........',
    '.kkkkkk.',
    'kWwWWwWk',
    'kWWWWWWk',
    '.kkkkkk.',
    '........',
  ],
  [CARRY_STONE_GLYPH]: [
    '........',
    '........',
    '........',
    '...kkk..',
    '..kssSk.',
    '.ksssSSk',
    '.kSSSSSk',
    '..kkkkk.',
  ],
  [SLEEP_GLYPH]: [
    '........',
    'kkkkkk..',
    'kwwwwk..',
    '.kkwk...',
    '.kwkk...',
    'kwwwwk..',
    'kkkkkk..',
    '........',
  ],
}

/** Each icon pixel is this many atlas pixels: the cell is 16 and the icon is drawn at 8, so one pixel lands on one. */
const ICON_SCALE = GLYPH_CELL / 8

export function bakeGlyphs(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, GLYPH_SIZE.width, GLYPH_SIZE.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  GLYPHS.forEach((glyph, i) => {
    const x0 = (i % GLYPH_COLUMNS) * GLYPH_CELL
    const y0 = Math.floor(i / GLYPH_COLUMNS) * GLYPH_CELL
    const icon = PIXEL_ICONS[glyph]
    if (icon) {
      icon.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          const color = ICON_COLORS[row[c]]
          if (!color) continue
          ctx.fillStyle = color
          ctx.fillRect(x0 + c * ICON_SCALE, y0 + r * ICON_SCALE, ICON_SCALE, ICON_SCALE)
        }
      })
      return
    }
    ctx.font = '14px serif'
    ctx.fillStyle = '#000'
    ctx.fillText(glyph, x0 + GLYPH_CELL / 2, y0 + GLYPH_CELL / 2)
  })
}

/** Whether a glyph is drawn as a pixel icon (a test keeps every glyph the map draws in this set). */
export function hasPixelIcon(glyph: string): boolean {
  return glyph in PIXEL_ICONS
}

// ---- Boats -------------------------------------------------------------------

export const BOAT_CELL = { width: 32, height: 32 }
/** Where the canvas painter's boat origin sits inside a cell (the hull sits where it always did; the cell is taller for a mast and a funnel). */
export const BOAT_ORIGIN = { x: 16, y: 13 }
/** Frames per boat variant: idle, under construction, then six moving frames (stroke and wake). */
export const BOAT_FRAMES = 8
/** Variants: each hull without goods, then with goods on deck. */
export const BOAT_VARIANTS = BOAT_HULLS.length * 2
export const BOAT_COLUMNS = BOAT_FRAMES * BOAT_VARIANTS
/** The four ways a pier can run from its harbour to the dry land: right, left, down, up (after the boat columns). */
export const PIER_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
export const BOAT_SIZE = {
  width: BOAT_CELL.width * (BOAT_COLUMNS + PIER_DIRECTIONS.length),
  height: BOAT_CELL.height,
}

/** 0 idle, 1 under construction, then moving frames by stroke (0..1) and wake (0..2). */
export function boatFrame(moving: boolean, building: boolean, time: number): number {
  if (building) return 1
  if (!moving) return 0
  const wake = Math.floor(time / 180) % 3
  const stroke = Math.floor(time / 220) % 2
  return 2 + stroke * 3 + wake
}

/** The variant of a boat from its owner's era tier and the goods on its deck (an index into `BOAT_HULLS`, doubled when laden). */
export function boatVariantOf(era: string | undefined, cargo: number | undefined): number {
  const tier = eraTier(era)
  const hull = tier <= 0 ? 0 : tier === 1 ? 1 : tier <= 4 ? 2 : 3
  return hull * 2 + (cargo && cargo > 0 ? 1 : 0)
}

/** The atlas column of one frame of a variant. */
export function boatColumn(variant: number, frame: number): number {
  return variant * BOAT_FRAMES + frame
}

/** The atlas column of a pier running towards (dx, dy) from its harbour, or -1 for no such way. */
export function pierColumn(dx: number, dy: number): number {
  const k = PIER_DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy)
  return k < 0 ? -1 : BOAT_COLUMNS + k
}

/**
 * A pier from the dry land (12 px from the harbour's centre) out over the water (6 px past it): a
 * three-pixel deck on posts, drawn in the wood colours of the hulls. `(dx, dy)` is the way to the land.
 */
function drawPier(ctx: CanvasRenderingContext2D, dx: number, dy: number): void {
  const c = 16
  const d = dx !== 0 ? dx : dy
  const from = c + 12 * d
  const to = c - 6 * d
  const lo = Math.min(from, to)
  const len = Math.abs(from - to)
  const across =
    dx !== 0
      ? (rx: number, ry: number, w: number, h: number) => ctx.fillRect(rx, ry, w, h)
      : (rx: number, ry: number, w: number, h: number) => ctx.fillRect(ry, rx, h, w)
  // The deck: a lit top row, the planks, a dark edge.
  ctx.fillStyle = '#a07843'
  across(lo, 15, len, 3)
  ctx.fillStyle = '#d0a668'
  across(lo, 15, len, 1)
  ctx.fillStyle = '#5a3d27'
  across(lo, 17, len, 1)
  // Posts under the deck, at both ends and in the middle.
  for (const p of [lo, lo + Math.floor(len / 2), lo + len - 1]) {
    across(p, 18, 1, 2)
  }
}

export function bakeBoats(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, BOAT_SIZE.width, BOAT_SIZE.height)
  const timeFor = (wake: number, stroke: number): number => {
    for (let t = 0; t < 4000; t += 10)
      if (Math.floor(t / 180) % 3 === wake && Math.floor(t / 220) % 2 === stroke) return t
    return 0
  }
  for (let variant = 0; variant < BOAT_VARIANTS; variant++) {
    const hull = BOAT_HULLS[variant >> 1]!
    const cargo = (variant & 1) === 1
    const paint = (frame: number, moving: boolean, building: boolean, time: number) => {
      ctx.save()
      ctx.translate(boatColumn(variant, frame) * BOAT_CELL.width, 0)
      drawBoatHull(ctx, BOAT_ORIGIN.x, BOAT_ORIGIN.y, time, moving, building, hull, cargo)
      ctx.restore()
    }
    paint(0, false, false, 0)
    paint(1, false, true, 0)
    for (let stroke = 0; stroke < 2; stroke++)
      for (let wake = 0; wake < 3; wake++) paint(2 + stroke * 3 + wake, true, false, timeFor(wake, stroke))
  }
  PIER_DIRECTIONS.forEach(([dx, dy], k) => {
    ctx.save()
    ctx.translate((BOAT_COLUMNS + k) * BOAT_CELL.width, 0)
    drawPier(ctx, dx, dy)
    ctx.restore()
  })
}

// ---- Animals made of ASCII pixel art -----------------------------------------

export const PIXEL_FAUNA_CELL = 16
export const PIXEL_FAUNA_KINDS: readonly string[] = pixelFaunaKinds()
/** Poses per kind in the atlas: two walk frames, then a still pose (a sleeping bear lies down). */
export const PIXEL_FAUNA_POSES = 3
export const PIXEL_FAUNA_SIZE = {
  width: PIXEL_FAUNA_CELL * PIXEL_FAUNA_KINDS.length * PIXEL_FAUNA_POSES,
  height: PIXEL_FAUNA_CELL,
}

/** Where the sprite's top-left sits in its cell: centred, rounded the way the painter rounds. */
export function pixelFaunaOffset(kind: string): { x: number; y: number } {
  const d = pixelFaunaDims(kind)!
  return {
    x: Math.round(PIXEL_FAUNA_CELL / 2 - d.cols / 2),
    y: Math.round(PIXEL_FAUNA_CELL / 2 - d.rows / 2),
  }
}

/** The atlas cell of a kind: its walk frame `step` (0 or 1), or its still pose when `still`. */
export function pixelFaunaFrame(kind: string, step: number, still = false): number {
  const pose = still ? 2 : step & 1
  return PIXEL_FAUNA_KINDS.indexOf(kind) * PIXEL_FAUNA_POSES + pose
}

/** One texel per sprite pixel: the layer scales a cell up by the same whole number the painter used. */
export function bakePixelFauna(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, PIXEL_FAUNA_SIZE.width, PIXEL_FAUNA_SIZE.height)
  PIXEL_FAUNA_KINDS.forEach((kind, k) => {
    const d = pixelFaunaDims(kind)!
    for (let pose = 0; pose < PIXEL_FAUNA_POSES; pose++) {
      ctx.save()
      ctx.translate((k * PIXEL_FAUNA_POSES + pose) * PIXEL_FAUNA_CELL, 0)
      // size == cols gives one canvas pixel per sprite pixel; (8, 8) is the cell centre.
      drawPixelFauna(ctx, kind, PIXEL_FAUNA_CELL / 2, PIXEL_FAUNA_CELL / 2, d.cols, false, pose)
      ctx.restore()
    }
  })
}

// ---- Animals cut from the fauna sheet ---------------------------------------

export const FAUNA_CELL = 32
export const FAUNA_KINDS = ['rabbit', 'deer', 'boar', 'bird', 'wolf', 'dog', 'fish', 'goldBird'] as const
export type FaunaKind = (typeof FAUNA_KINDS)[number]
export const FAUNA_SIZE = { width: FAUNA_CELL * FAUNA_KINDS.length, height: FAUNA_CELL }

export function faunaCellKind(kind: string, id: number): FaunaKind | null {
  if (kind === 'bird') return id % 2 === 0 ? 'bird' : 'goldBird'
  return (FAUNA_KINDS as readonly string[]).includes(kind) ? (kind as FaunaKind) : null
}

/** The painter's scaled size for a cut-out, in world pixels. */
export function faunaDrawSize(kind: FaunaKind): { w: number; h: number } {
  const [, , sw, sh] = FAUNA_RECTS[kind]
  const size = animalSize(kind === 'goldBird' ? 'bird' : kind)
  const scale = size / Math.max(sw, sh)
  return { w: Math.max(1, Math.round(sw * scale)), h: Math.max(1, Math.round(sh * scale)) }
}

/** Cut each animal out of the sheet at the size it is drawn, nearest-neighbour like the painter. */
export function bakeFauna(ctx: CanvasRenderingContext2D, sheet: CanvasImageSource): void {
  ctx.clearRect(0, 0, FAUNA_SIZE.width, FAUNA_SIZE.height)
  ctx.imageSmoothingEnabled = false
  FAUNA_KINDS.forEach((kind, i) => {
    const [sx, sy, sw, sh] = FAUNA_RECTS[kind]
    const { w, h } = faunaDrawSize(kind)
    const tx = i * FAUNA_CELL + FAUNA_CELL / 2 - Math.round(w / 2)
    const ty = FAUNA_CELL / 2 - Math.round(h / 2)
    ctx.drawImage(sheet, sx, sy, sw, sh, tx, ty, w, h)
  })
}

// ---- Emotes: the little thought bubbles over people's heads ---------------------

export const EMOTE_CELL = 16
export const EMOTE_SIZE = { width: EMOTE_CELL * EMOTES.length, height: EMOTE_CELL }
/** Where the painter's bubble is drawn inside a cell: `drawEmote` at (8, 12) with no bob. */
export const EMOTE_ORIGIN = { x: 8, y: 12 }

export function emoteFrame(emote: Emote): number {
  return EMOTES.indexOf(emote)
}

/** Bakes each bubble with the painter's own `drawEmote`, so the pixels cannot drift. */
export function bakeEmotes(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, EMOTE_SIZE.width, EMOTE_SIZE.height)
  EMOTES.forEach((emote, i) => {
    ctx.save()
    ctx.translate(i * EMOTE_CELL, 0)
    drawEmote(ctx, emote, EMOTE_ORIGIN.x, EMOTE_ORIGIN.y, 0, 0)
    ctx.restore()
  })
}
