/**
 * Small texture atlases drawn once with Canvas2D and sampled by SpriteLayer
 * through dynamic canvases. Every atlas is a uniform grid because a layer atlas
 * is `frameWidth x frameHeight` cells indexed row-major.
 */
import { SPECIALTY_EMOJI } from '../draw-helpers'
import { drawBoat } from '../boat-sprite'
import { drawPixelFauna, pixelFaunaDims, pixelFaunaKinds } from '../pixel-fauna'
import { FAUNA_RECTS } from '../fauna-layout'
import { animalSize } from '../animal-visuals'
import { EMOTES, drawEmote, type Emote } from '../activity-emotes'

// ---- Decals: soft white shapes, tinted and scaled per sprite ----------------

export const DECAL_CELL = 32
export const DECAL = { disc: 0, ring: 1, diamond: 2, dashed: 3 } as const
export const DECAL_COLUMNS = 4
export const DECAL_SIZE = { width: DECAL_CELL * DECAL_COLUMNS, height: DECAL_CELL }

export function bakeDecals(ctx: CanvasRenderingContext2D): void {
  const c = DECAL_CELL
  ctx.clearRect(0, 0, DECAL_SIZE.width, DECAL_SIZE.height)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  // disc
  ctx.beginPath()
  ctx.arc(c * DECAL.disc + c / 2, c / 2, c / 2 - 0.5, 0, Math.PI * 2)
  ctx.fill()
  // ring, thick enough to read as ~1.5px at the drawn size of 20px
  ctx.lineWidth = 2.6
  ctx.beginPath()
  ctx.arc(c * DECAL.ring + c / 2, c / 2, c / 2 - 1.8, 0, Math.PI * 2)
  ctx.stroke()
  // diamond ring
  ctx.lineWidth = 3
  ctx.beginPath()
  const dx = c * DECAL.diamond + c / 2
  ctx.moveTo(dx, 2)
  ctx.lineTo(dx + c / 2 - 2, c / 2)
  ctx.lineTo(dx, c - 2)
  ctx.lineTo(dx - c / 2 + 2, c / 2)
  ctx.closePath()
  ctx.stroke()
  // dashed ring: the selection marker, rotated a little each frame
  ctx.lineWidth = 2.6
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.arc(c * DECAL.dashed + c / 2, c / 2, c / 2 - 1.8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
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

export const GLYPHS: readonly string[] = Array.from(
  new Set([
    ...Object.values(SPECIALTY_EMOJI),
    ...TOOL_EMOJI,
    SICK_EMOJI,
    DEGREE_EMOJI,
    ELDER_CANE_EMOJI,
    SLEEP_GLYPH,
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

export function bakeGlyphs(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, GLYPH_SIZE.width, GLYPH_SIZE.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  GLYPHS.forEach((glyph, i) => {
    const cx = (i % GLYPH_COLUMNS) * GLYPH_CELL + GLYPH_CELL / 2
    const cy = Math.floor(i / GLYPH_COLUMNS) * GLYPH_CELL + GLYPH_CELL / 2
    if (glyph === SLEEP_GLYPH) {
      ctx.font = 'bold 14px monospace'
      ctx.fillStyle = '#e8eef8'
    } else {
      ctx.font = '14px serif'
      ctx.fillStyle = '#000'
    }
    ctx.fillText(glyph, cx, cy)
  })
}

// ---- Boats -------------------------------------------------------------------

export const BOAT_CELL = { width: 32, height: 16 }
/** Where the canvas painter's boat origin sits inside a cell. */
export const BOAT_ORIGIN = { x: 16, y: 5 }
export const BOAT_COLUMNS = 8
export const BOAT_SIZE = { width: BOAT_CELL.width * BOAT_COLUMNS, height: BOAT_CELL.height }

/** 0 idle, 1 under construction, then moving frames by stroke (0..1) and wake (0..2). */
export function boatFrame(moving: boolean, building: boolean, time: number): number {
  if (building) return 1
  if (!moving) return 0
  const wake = Math.floor(time / 180) % 3
  const stroke = Math.floor(time / 220) % 2
  return 2 + stroke * 3 + wake
}

export function bakeBoats(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, BOAT_SIZE.width, BOAT_SIZE.height)
  const timeFor = (wake: number, stroke: number): number => {
    for (let t = 0; t < 4000; t += 10)
      if (Math.floor(t / 180) % 3 === wake && Math.floor(t / 220) % 2 === stroke) return t
    return 0
  }
  const paint = (frame: number, moving: boolean, building: boolean, time: number) => {
    ctx.save()
    ctx.translate(frame * BOAT_CELL.width, 0)
    drawBoat(ctx, BOAT_ORIGIN.x, BOAT_ORIGIN.y, time, moving, building)
    ctx.restore()
  }
  paint(0, false, false, 0)
  paint(1, false, true, 0)
  for (let stroke = 0; stroke < 2; stroke++)
    for (let wake = 0; wake < 3; wake++) paint(2 + stroke * 3 + wake, true, false, timeFor(wake, stroke))
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
