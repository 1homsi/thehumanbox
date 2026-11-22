/** Work poses come from current actions, never professions or planned jobs. */
export type WorkActivity =
  | 'build'
  | 'chop'
  | 'mine'
  | 'till'
  | 'dig'
  | 'farm'
  | 'fish'
  | 'gather'
  | 'hunt'
  | 'craft'
  | 'cook'
  | 'eat'
  | 'drink'
  | 'talk'
  | 'dance'
  | 'fight'
  | 'rest'
  | null

export type SheetPose = 'dig' | 'craft' | 'cook' | 'eat' | 'drink' | 'talk' | 'dance' | 'fight'

export interface PosePart {
  css: string
  x: number
  y: number
  w: number
  h: number
  mx: number
  my: number
  above: number
}

export interface PoseSheet {
  period: number
  headHigh: boolean
  parts: readonly PosePart[]
}

function posePart(
  css: string,
  x: number,
  y: number,
  w: number,
  h: number,
  mx = 0,
  my = 0,
  above = -2,
): PosePart {
  return { css, x, y, w, h, mx, my, above }
}

const SKIN_TONE = '#d6b389'
const WOOD_TONE = '#b38b52'
const IRON_TONE = '#93918b'
const EARTH_TONE = '#8a6a45'

export const POSE_SHEETS: Record<SheetPose, PoseSheet> = {
  dig: {
    period: 200,
    headHigh: false,
    parts: [
      posePart(EARTH_TONE, 7, 0, 3, 1),
      posePart(WOOD_TONE, 5, -10, 1, 8, 0, 2),
      posePart(IRON_TONE, 4, -2, 3, 2, 0, 2),
      posePart(EARTH_TONE, 8, -3, 1, 1, 0, 0, 0.6),
      posePart(EARTH_TONE, 10, -1, 1, 1, 0, 0, 0.8),
    ],
  },
  craft: {
    period: 150,
    headHigh: false,
    parts: [
      posePart('#9e703e', 4, -2, 5, 2),
      posePart(WOOD_TONE, 6, -6, 1, 3, 0, 1.5),
      posePart(IRON_TONE, 5, -8, 3, 2, 0, 1.5),
      posePart('#f3d17a', 9, -4, 1, 1, 0, 0, 0.8),
    ],
  },
  cook: {
    period: 300,
    headHigh: false,
    parts: [
      posePart('#e2574c', 5, 0, 3, 1),
      posePart('#f3d17a', 6, 0, 1, 1, 0, 0, 0),
      posePart('#4a4038', 4, -3, 5, 3),
      posePart(IRON_TONE, 4, -4, 5, 1),
      posePart(WOOD_TONE, 6, -8, 1, 4, 1, 0),
      posePart('#c8d3db', 5, -6, 1, 1, 0, 0, 0.3),
      posePart('#c8d3db', 8, -7, 1, 1, 0, 0, -0.3),
    ],
  },
  eat: {
    period: 240,
    headHigh: true,
    parts: [posePart(SKIN_TONE, 3, -8, 2, 2, -1, -2), posePart('#d9a55c', 3, -10, 2, 2, -1, -2)],
  },
  drink: {
    period: 420,
    headHigh: true,
    parts: [posePart('#a8693f', 3, -9, 2, 3, -1, -2), posePart('#7cc8ff', 3, -9, 2, 1, -1, -2)],
  },
  talk: {
    period: 230,
    headHigh: true,
    parts: [posePart(SKIN_TONE, 4, -8, 2, 2, 0, 1.5), posePart(SKIN_TONE, -6, -7, 2, 2, 0, -1.5)],
  },
  dance: {
    period: 160,
    headHigh: true,
    parts: [posePart(SKIN_TONE, 4, -13, 2, 2, 0, 2), posePart(SKIN_TONE, -6, -13, 2, 2, 0, -2)],
  },
  fight: {
    period: 120,
    headHigh: false,
    parts: [posePart(WOOD_TONE, 1, -6, 11, 1, 2, 0), posePart('#b5b5a5', 12, -7, 2, 3, 2, 0)],
  },
}

const HEAD_HIGH = new Set<WorkActivity>(
  (Object.keys(POSE_SHEETS) as SheetPose[]).filter((pose) => POSE_SHEETS[pose].headHigh),
)
const FULL_HEIGHT = 16

export function poseLift(activity: WorkActivity, figureHeight: number): number {
  return HEAD_HIGH.has(activity) ? FULL_HEIGHT - figureHeight : 0
}

export interface ToolHead {
  css: string
  x: number
  y: number
  w: number
  h: number
}

export const TOOL_HEADS: Record<'build' | 'chop' | 'mine' | 'till', ToolHead> = {
  build: { css: IRON_TONE, x: -2, y: -8, w: 4, h: 2 },
  chop: { css: '#b5b5a5', x: -2, y: -8, w: 4, h: 4 },
  mine: { css: '#b5b5a5', x: -2, y: -8, w: 7, h: 2 },
  till: { css: IRON_TONE, x: 0, y: -8, w: 3, h: 2 },
}

export const WORK_ACTIVITIES = [
  'build',
  'chop',
  'mine',
  'till',
  'dig',
  'farm',
  'fish',
  'gather',
  'hunt',
  'craft',
  'cook',
  'eat',
  'drink',
  'talk',
  'dance',
  'fight',
  'rest',
] as const satisfies readonly NonNullable<WorkActivity>[]

export function activityCode(activity: WorkActivity): number {
  return activity === null ? 0 : WORK_ACTIVITIES.indexOf(activity) + 1
}

const thoughtCodes = new Map<string, number>()

export function workActivityCode(thought: string): number {
  const cached = thoughtCodes.get(thought)
  if (cached !== undefined) return cached
  const code = activityCode(workActivity(thought, false))
  if (thoughtCodes.size >= 5000) thoughtCodes.clear()
  thoughtCodes.set(thought, code)
  return code
}

export interface BodyBeat {
  period: number
  above: number
}

const SWING_BEAT: BodyBeat = { period: 180, above: 0.3 }

const BODY_BEATS: Partial<Record<NonNullable<WorkActivity>, BodyBeat>> = {
  build: SWING_BEAT,
  chop: SWING_BEAT,
  mine: SWING_BEAT,
  till: SWING_BEAT,
  farm: SWING_BEAT,
  gather: SWING_BEAT,
  dig: { period: 200, above: 0.3 },
  craft: { period: 150, above: 0.5 },
  talk: { period: 230, above: 0.8 },
  dance: { period: 160, above: 0 },
  fight: { period: 120, above: 0.5 },
  hunt: { period: 260, above: -2 },
}

export const BEAT_PERIOD = new Float32Array(WORK_ACTIVITIES.length + 1)
export const BEAT_ABOVE = new Float32Array(WORK_ACTIVITIES.length + 1)
WORK_ACTIVITIES.forEach((activity, i) => {
  const beat = BODY_BEATS[activity]
  BEAT_PERIOD[i + 1] = beat ? beat.period : 0
  BEAT_ABOVE[i + 1] = beat ? beat.above : 0
})

const thoughtActivities = new Map<string, WorkActivity>()

export function workActivity(thought: string, moving: boolean): WorkActivity {
  if (moving) return null
  const cached = thoughtActivities.get(thought)
  if (cached !== undefined) return cached
  const activity = activityForThought(thought)
  if (thoughtActivities.size >= 5000) thoughtActivities.clear()
  thoughtActivities.set(thought, activity)
  return activity
}

function activityForThought(thought: string): WorkActivity {
  const t = thought.toLowerCase()
  if (/\b(seeking|looking|searching|heading|walking|traveling|going|planning|wanting)\b/.test(t)) return null
  if (
    /repairing|rebuilding|reclaiming|building|constructing|raising|thatching|roofing|laying (the )?(bricks?|stones?|foundations?)/.test(
      t,
    )
  )
    return 'build'
  if (/chopping|cutting wood|gathering (wood|timber)|felling|splitting (logs|wood)|logging/.test(t))
    return 'chop'
  if (/mining|quarrying|gathering stone|digging ore|breaking rock/.test(t)) return 'mine'
  if (/\bdigging\b/.test(t)) return 'dig'
  if (/planting|sowing|tilling|hoeing|plowing|ploughing|weeding/.test(t)) return 'till'
  if (/harvesting|reaping|threshing|irrigating|tending crops/.test(t)) return 'farm'
  if (/fishing|caught a fish|casting a (net|line)/.test(t)) return 'fish'
  if (/stalking|tracking|caught small game|setting a trap|checking the traps|trap caught|\bhunting\b/.test(t))
    return 'hunt'
  if (/\b(fighting|attacking|defending|duelling|dueling|sparring|challenging)\b/.test(t)) return 'fight'
  if (/\b(cooking|baking|roasting|boiling|brewing|stewing|grilling|tending (the )?fire|stoking)\b/.test(t))
    return 'cook'
  if (
    /\b(crafting|carving|knapping|weaving|sewing|stitching|forging|smithing|hammering|whittling|tanning|sharpening|mending|spinning)\b/.test(
      t,
    )
  )
    return 'craft'
  if (/\b(eating|feasting|chewing|dining)\b/.test(t)) return 'eat'
  if (/\b(drinking|sipping)\b/.test(t)) return 'drink'
  if (/\b(dancing|playing|celebrating|singing)\b/.test(t)) return 'dance'
  if (
    /\b(talking|chatting|gossiping|telling|arguing|greeting|teaching|discussing|debating|haggling|bargaining)\b/.test(
      t,
    )
  )
    return 'talk'
  if (/foraging|gathering|picking berries/.test(t)) return 'gather'
  if (/sleeping|\bresting|dozing|napping/.test(t)) return 'rest'
  return null
}

export function drawWorkActivity(
  ctx: CanvasRenderingContext2D,
  activity: WorkActivity,
  x: number,
  y: number,
  flipped: boolean,
  time: number,
  phase: number,
) {
  if (!activity) return
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  if (flipped) ctx.scale(-1, 1)
  if (activity === 'rest') {
    ctx.fillStyle = '#c8d3db'
    ctx.fillRect(5, -12, 3, 1)
    ctx.fillRect(6, -11, 1, 1)
    ctx.fillRect(5, -10, 3, 1)
  } else if (activity === 'fish') {
    ctx.strokeStyle = '#b99760'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(3, -3)
    ctx.lineTo(10, -13)
    ctx.stroke()
    ctx.strokeStyle = '#c4c5ad'
    ctx.beginPath()
    ctx.moveTo(10, -13)
    ctx.lineTo(15, 1)
    ctx.stroke()
    ctx.fillStyle = '#d99a59'
    ctx.fillRect(14, 1, 2, 2)
  } else if (activity === 'hunt') {
    // A spear held low and steady, its point bobbing with the stalk.
    const bob = Math.round(Math.sin(time / 260 + phase))
    ctx.fillStyle = '#b38b52'
    ctx.fillRect(1, -4 + bob, 12, 1)
    ctx.fillStyle = '#b5b5a5'
    ctx.fillRect(13, -5 + bob, 2, 3)
  } else if (activity === 'gather' || activity === 'farm') {
    const swing = Math.sin(time / 180 + phase)
    ctx.fillStyle = '#9e703e'
    ctx.fillRect(5, 0, 5, 3)
    ctx.fillStyle = '#88a34c'
    ctx.fillRect(6, -1, 3, 2)
    ctx.fillStyle = '#d6b389'
    ctx.fillRect(3 + Math.round(swing), -3 + Math.round(swing), 3, 2)
  } else if (activity === 'build' || activity === 'chop' || activity === 'mine' || activity === 'till') {
    const swing = Math.sin(time / 180 + phase)
    const head = TOOL_HEADS[activity]
    ctx.translate(4, -4)
    ctx.rotate(-0.8 + swing * 0.85)
    ctx.fillStyle = '#b38b52'
    ctx.fillRect(0, -7, 1, 8)
    ctx.fillStyle = head.css
    ctx.fillRect(head.x, head.y, head.w, head.h)
    if (swing > 0.75) {
      ctx.fillStyle = '#c9b28a'
      ctx.fillRect(3, 3, 1, 1)
      ctx.fillRect(-3, 2, 1, 1)
    }
  } else {
    const sheet = POSE_SHEETS[activity]
    const wave = Math.sin(time / sheet.period + phase)
    for (const p of sheet.parts) {
      if (wave < p.above) continue
      ctx.fillStyle = p.css
      ctx.fillRect(p.x + Math.round(wave * p.mx), p.y + Math.round(wave * p.my), p.w, p.h)
    }
  }
  ctx.restore()
}
