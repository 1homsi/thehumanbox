import { POSE_SHEETS, TOOL_HEADS, type SheetPose, type WorkActivity } from '../../activity-visuals'
import { packRgba, parseColor } from '../overlays/color'

/** Where a pose's rectangles go: an untextured quad by its centre, size, rotation (radians) and packed colour. */
export interface PoseSink {
  solid(cx: number, cy: number, w: number, h: number, rotation: number, color: number): void
}

/** A rectangle of a pose in the pose's own frame: top-left and size, and the colour it is filled with. */
interface Part {
  x: number
  y: number
  w: number
  h: number
  r: number
  g: number
  b: number
  a: number
  /** The colour packed at full strength (the usual case). */
  full: number
}

function part(css: string, x: number, y: number, w: number, h: number): Part {
  const c = parseColor(css)
  return { x, y, w, h, r: c.r, g: c.g, b: c.b, a: c.a, full: packRgba(c.r, c.g, c.b, c.a) }
}

const REST: Part[] = [
  part('#c8d3db', 5, -12, 3, 1),
  part('#c8d3db', 6, -11, 1, 1),
  part('#c8d3db', 5, -10, 3, 1),
]
const BASKET = part('#9e703e', 5, 0, 5, 3)
const LEAVES = part('#88a34c', 6, -1, 3, 2)
const REACH = part('#d6b389', 0, 0, 3, 2)
const HANDLE = part('#b38b52', 0, -7, 1, 8)
const TOOL_HEAD_PARTS = {
  build: part(
    TOOL_HEADS.build.css,
    TOOL_HEADS.build.x,
    TOOL_HEADS.build.y,
    TOOL_HEADS.build.w,
    TOOL_HEADS.build.h,
  ),
  chop: part(TOOL_HEADS.chop.css, TOOL_HEADS.chop.x, TOOL_HEADS.chop.y, TOOL_HEADS.chop.w, TOOL_HEADS.chop.h),
  mine: part(TOOL_HEADS.mine.css, TOOL_HEADS.mine.x, TOOL_HEADS.mine.y, TOOL_HEADS.mine.w, TOOL_HEADS.mine.h),
  till: part(TOOL_HEADS.till.css, TOOL_HEADS.till.x, TOOL_HEADS.till.y, TOOL_HEADS.till.w, TOOL_HEADS.till.h),
}

interface SheetParts {
  period: number
  parts: Part[]
  mx: Float32Array
  my: Float32Array
  above: Float32Array
}

function sheetParts(pose: SheetPose): SheetParts {
  const sheet = POSE_SHEETS[pose]
  return {
    period: sheet.period,
    parts: sheet.parts.map((p) => part(p.css, p.x, p.y, p.w, p.h)),
    mx: Float32Array.from(sheet.parts, (p) => p.mx),
    my: Float32Array.from(sheet.parts, (p) => p.my),
    above: Float32Array.from(sheet.parts, (p) => p.above),
  }
}

const SHEETS: Record<SheetPose, SheetParts> = {
  dig: sheetParts('dig'),
  craft: sheetParts('craft'),
  cook: sheetParts('cook'),
  eat: sheetParts('eat'),
  drink: sheetParts('drink'),
  talk: sheetParts('talk'),
  dance: sheetParts('dance'),
  fight: sheetParts('fight'),
}
const DUST: Part[] = [part('#c9b28a', 3, 3, 1, 1), part('#c9b28a', -3, 2, 1, 1)]
const SPEAR_SHAFT = part('#b38b52', 1, -4, 12, 1)
const SPEAR_POINT = part('#b5b5a5', 13, -5, 2, 3)

/** The poses `emitWorkPose` draws; fishing is strokes and stays with the canvas painter. */
export type FastPose = Exclude<WorkActivity, null | 'fish'>

export function isFastPose(activity: WorkActivity): activity is FastPose {
  return activity !== null && activity !== 'fish'
}

/** The part's colour at `alpha`, or -1 when nothing would show. */
function tint(p: Part, alpha: number): number {
  const a = p.a * alpha
  if (a <= 0) return -1
  return alpha === 1 ? p.full : packRgba(p.r, p.g, p.b, a)
}

/** A part in the pose's own frame, `dx`, `dy` further along, mirrored when `s` is -1. */
function put(
  sink: PoseSink,
  p: Part,
  ox: number,
  oy: number,
  s: number,
  flat: number,
  alpha: number,
  dx: number,
  dy: number,
): void {
  const color = tint(p, alpha)
  if (color < 0) return
  sink.solid(ox + s * (p.x + dx + p.w / 2), oy + p.y + dy + p.h / 2, p.w, p.h, flat, color)
}

/** A part in the tool's frame, turned by (`cos`, `sin`) about (4, -4). */
function tool(
  sink: PoseSink,
  p: Part,
  ox: number,
  oy: number,
  s: number,
  cos: number,
  sin: number,
  turned: number,
  alpha: number,
): void {
  const color = tint(p, alpha)
  if (color < 0) return
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  sink.solid(ox + s * (4 + cos * cx - sin * cy), oy - 4 + sin * cx + cos * cy, p.w, p.h, turned, color)
}

/**
 * `drawWorkActivity` written straight into sprites: the same rectangles in the same order, placed the way the
 * recorder places them under `translate(round(x), round(y))`, the mirror and the tool's swing, without the
 * canvas calls in between. `alpha` is what `globalAlpha` was.
 */
export function emitWorkPose(
  sink: PoseSink,
  activity: FastPose,
  x: number,
  y: number,
  flipped: boolean,
  time: number,
  phase: number,
  alpha: number,
): void {
  const ox = Math.round(x)
  const oy = Math.round(y)
  const s = flipped ? -1 : 1
  // The recorder reads a mirror as a turn of -pi.
  const flat = flipped ? -Math.PI : 0
  if (activity === 'rest') {
    for (let i = 0; i < REST.length; i++) put(sink, REST[i], ox, oy, s, flat, alpha, 0, 0)
    return
  }
  if (activity === 'hunt') {
    // A spear held low, its point bobbing with the stalk.
    const bob = Math.round(Math.sin(time / 260 + phase))
    put(sink, SPEAR_SHAFT, ox, oy, s, flat, alpha, 0, bob)
    put(sink, SPEAR_POINT, ox, oy, s, flat, alpha, 0, bob)
    return
  }
  if (
    activity !== 'gather' &&
    activity !== 'farm' &&
    activity !== 'build' &&
    activity !== 'chop' &&
    activity !== 'mine' &&
    activity !== 'till'
  ) {
    const sheet = SHEETS[activity]
    const wave = Math.sin(time / sheet.period + phase)
    const { parts, mx, my, above } = sheet
    for (let i = 0; i < parts.length; i++) {
      if (wave < above[i]) continue
      put(sink, parts[i], ox, oy, s, flat, alpha, Math.round(wave * mx[i]), Math.round(wave * my[i]))
    }
    return
  }
  const swing = Math.sin(time / 180 + phase)
  if (activity === 'gather' || activity === 'farm') {
    put(sink, BASKET, ox, oy, s, flat, alpha, 0, 0)
    put(sink, LEAVES, ox, oy, s, flat, alpha, 0, 0)
    // The reaching hand steps a pixel with the swing.
    const k = Math.round(swing)
    put(sink, REACH, ox, oy, s, flat, alpha, 3 + k, -3 + k)
    return
  }
  // A tool swung from the hand: its frame is turned about (4, -4) by the swing.
  const angle = -0.8 + swing * 0.85
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const turned = Math.atan2(sin, s * cos)
  tool(sink, HANDLE, ox, oy, s, cos, sin, turned, alpha)
  tool(sink, TOOL_HEAD_PARTS[activity], ox, oy, s, cos, sin, turned, alpha)
  if (swing > 0.75)
    for (let i = 0; i < DUST.length; i++) tool(sink, DUST[i], ox, oy, s, cos, sin, turned, alpha)
}
