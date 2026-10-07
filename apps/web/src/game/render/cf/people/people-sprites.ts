import { SPRITE_FLIP_X, SPRITE_HIDDEN, type SpriteLayer } from 'cubeforge'
import type { OrganismState, VehicleInfo } from '../../../../shared/types'
import type { ViewFlags } from '../../../../state/store'
import { lineageColor } from '../../../../shared/constants'
import { THOUGHT_COLORS, TILE } from '../../../model/palette'
import { orgVariant } from '../../../model/org-variant'
import { ERA_STRIPE_COLOR, SPECIALTY_EMOJI, orgAnimPhase, pickToolEmoji } from '../../draw-helpers'
import {
  HUMAN_ATLAS_FRAMES,
  deterministicAppearanceIndex,
  humanAtlasRow,
  resolveAgeStage,
  zoomDetailLevel,
} from '../../character-visuals'
import { boatFrame, DECAL, DEGREE_EMOJI, SICK_EMOJI, emoteFrame, glyphFrame } from '../atlas-bake'
import { emoteFor } from '../../activity-emotes'
import { AttachedSprites, storeChanged } from '../attached'
import { cssToRgba32, rgba32, withAlpha } from '../colors'
import { MotionStore } from '../motion'
import { labelFlagsOf } from './people-labels'

/** Atlas slots, by layer. */
export const BODY_ATLAS = { people: 0, boats: 1 } as const

export interface PeopleFrameInput {
  /** Everyone on the current frame; the dead are skipped. */
  orgs: readonly OrganismState[]
  /** The frame before, for walking from where each person was. */
  prevOrgs: readonly OrganismState[] | null
  selectedId: string | null
  focus: string
  viewFlags: Pick<ViewFlags, 'health' | 'age' | 'fear' | 'lineageDot' | 'pregnancy'>
  zoom: number
  vehicles: readonly VehicleInfo[]
  lineageEras: Record<string, string>
  ruinedTiles: ReadonlySet<string>
  ox: number
  oy: number
}

export function isFocused(org: OrganismState, focus: string): boolean {
  if (focus === 'all') return true
  if (focus.startsWith('lineage:')) return org.lineage_id === focus.slice(8)
  if (focus === 'sick') return org.infection > 0.15
  if (focus === 'hungry') return org.energy < 0.3
  if (focus === 'elders') return !!org.is_elder
  if (focus === 'builders')
    return !!(org.discoveries ?? []).some((d) =>
      ['shelter', 'fire', 'masonry', 'stone_tools', 'spear'].includes(d),
    )
  if (focus === 'thriving') return org.energy > 0.8 && org.hydration > 0.8
  return true
}

const WHITE = 0xffffffff
const BLACK = rgba32(0, 0, 0)
const CROWN = cssToRgba32('#f2c84b')

/**
 * The population as three SpriteLayers written from typed arrays:
 *  - `soft`  (under the people): shadows, auras and rings
 *  - `body`  (depth-sorted):      people and boats
 *  - `over`  (above the people):  crowns, vitals, stripes, emoji
 *  - `emote` (above those, pixel-crisp): thought bubbles
 * Names and thoughts are text and work poses are free-form strokes: they stay
 * on the canvas painter.
 *
 * Work is split by rate. `rebuild` runs when the simulation delivers a frame or
 * the UI changes (who is selected, zoom detail, view flags): it decides what
 * exists and its static look. `animate` runs every display frame: it only moves
 * things and picks the walk frame.
 */
export class PeopleSprites {
  readonly body: SpriteLayer
  readonly soft: AttachedSprites
  readonly over: AttachedSprites
  readonly emotes: AttachedSprites

  n = 0
  ids: string[] = []
  /** The living people of the last rebuild, in slot order (what `ids` names). */
  readonly orgs: OrganismState[] = []
  private cap = 0
  fromX = new Float64Array(0)
  fromY = new Float64Array(0)
  toX = new Float64Array(0)
  toY = new Float64Array(0)
  /** Where each person is drawn this frame, in world pixels (tile centre). */
  px = new Float32Array(0)
  py = new Float32Array(0)
  private size = new Uint8Array(0)
  private row = new Uint8Array(0)
  private alpha = new Uint8Array(0)
  /** Each person's walk-cycle offset, from their id. */
  phase = new Uint16Array(0)
  private restCandidate = new Uint8Array(0)
  /** Layer index of this rider's boat, or -1. */
  private boatIdx = new Int32Array(0)
  private boatBuilding = new Uint8Array(0)
  hidden = new Uint8Array(0)
  /** `LABEL_*` bits of each slot, worked out once per rebuild for the label painter. */
  labelFlags = new Uint8Array(0)
  private motion = new MotionStore()
  private oldMotion = new MotionStore()
  private index = new Map<string, number>()
  private oldIndex = new Map<string, number>()
  private prevSource: readonly OrganismState[] | null = null
  private prevById = new Map<string, OrganismState>()
  private ox = 0
  private oy = 0
  private lastMoved = -Infinity
  moving = false

  /** Every frame touches every sprite (the reference the tests compare the default against). */
  private readonly touchAll: boolean

  constructor(
    layers: { body: SpriteLayer; soft: SpriteLayer; over: SpriteLayer; emote: SpriteLayer },
    options: { touchAll?: boolean } = {},
  ) {
    this.body = layers.body
    this.soft = new AttachedSprites(layers.soft)
    this.over = new AttachedSprites(layers.over)
    this.emotes = new AttachedSprites(layers.emote)
    this.touchAll = options.touchAll ?? false
  }

  private reserve(n: number): void {
    if (n <= this.cap) return
    const cap = Math.max(n, this.cap * 2, 256)
    const grow = <T extends Float64Array | Float32Array | Uint8Array | Uint16Array | Int32Array>(
      old: T,
      make: new (len: number) => T,
    ): T => {
      const next = new make(cap)
      next.set(old)
      return next
    }
    this.fromX = grow(this.fromX, Float64Array)
    this.fromY = grow(this.fromY, Float64Array)
    this.toX = grow(this.toX, Float64Array)
    this.toY = grow(this.toY, Float64Array)
    this.px = grow(this.px, Float32Array)
    this.py = grow(this.py, Float32Array)
    this.size = grow(this.size, Uint8Array)
    this.row = grow(this.row, Uint8Array)
    this.alpha = grow(this.alpha, Uint8Array)
    this.phase = grow(this.phase, Uint16Array)
    this.restCandidate = grow(this.restCandidate, Uint8Array)
    this.boatIdx = grow(this.boatIdx, Int32Array)
    this.boatBuilding = grow(this.boatBuilding, Uint8Array)
    this.hidden = grow(this.hidden, Uint8Array)
    this.labelFlags = grow(this.labelFlags, Uint8Array)
    this.motion.reserve(cap)
    this.oldMotion.reserve(cap)
    this.cap = cap
  }

  /** Slot of a person by id, or -1. */
  slotOf(id: string): number {
    return this.index.get(id) ?? -1
  }

  /** Walking state per slot: the last step's direction and time, for names and work poses. */
  get stepState(): { flipped: Uint8Array; movedAt: Float64Array } {
    return this.motion
  }

  /** The person under a world-pixel point, or null. */
  pick(wx: number, wy: number): string | null {
    const slot = this.body.pick(wx, wy)
    return slot >= 0 && slot < this.n ? this.ids[slot] : null
  }

  rebuild(input: PeopleFrameInput): void {
    const { orgs, selectedId, focus, viewFlags, zoom, ox, oy } = input
    this.ox = ox
    this.oy = oy
    if (input.prevOrgs !== this.prevSource) {
      this.prevSource = input.prevOrgs
      this.prevById.clear()
      if (input.prevOrgs) for (const o of input.prevOrgs) this.prevById.set(o.id, o)
    }
    // Swap the motion stores and index maps: the old ones feed the new order.
    const tmp = this.oldMotion
    this.oldMotion = this.motion
    this.motion = tmp
    const tmpIndex = this.oldIndex
    this.oldIndex = this.index
    this.index = tmpIndex
    this.index.clear()

    let alive = 0
    for (const o of orgs) if (o.alive) alive++
    this.reserve(alive)
    const detail = zoomDetailLevel(zoom)
    const crowded = alive > 400
    const boats = new Map<string, VehicleInfo>()
    for (const v of input.vehicles) if (v.kind === 'boat' && v.rider_id) boats.set(v.rider_id, v)

    const body = this.body
    const { soft, over, emotes } = this
    body.clear()
    soft.begin()
    over.begin()
    emotes.begin()
    this.ids.length = 0
    this.orgs.length = 0

    const riders: number[] = []
    let j = 0
    for (const org of orgs) {
      if (!org.alive) continue
      const id = org.id
      this.ids.push(id)
      this.orgs.push(org)
      this.index.set(id, j)
      this.toX[j] = org.x
      this.toY[j] = org.y
      const p = this.prevById.get(id)
      if (p && p.alive) {
        this.fromX[j] = p.x
        this.fromY[j] = p.y
      } else {
        this.fromX[j] = org.x
        this.fromY[j] = org.y
      }
      const old = this.oldIndex.get(id)
      if (old !== undefined) this.motion.copyFrom(this.oldMotion, old, j)
      else this.motion.init(j, this.fromX[j], this.fromY[j])
      this.phase[j] = orgAnimPhase(id)
      this.labelFlags[j] = labelFlagsOf(org)

      const isSelected = id === selectedId
      const focused = isFocused(org, focus)
      const fa = focused ? 1 : 0.12
      const standard = isSelected || detail !== 'overview'
      const full = isSelected || detail === 'detail'
      const variant = orgVariant(id)
      const bodyR = variant.bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
      const size = Math.round(Math.max(19, bodyR * 3.8))
      const stage = resolveAgeStage(org)
      const sex = org.sex === 'female' ? 'female' : 'male'
      this.size[j] = size
      this.row[j] = humanAtlasRow(sex, stage, deterministicAppearanceIndex(id))
      this.alpha[j] = Math.round(255 * fa)

      // Resting indoors: not drawn unless they moved a moment ago (checked per frame).
      let rest = 0
      if (org.home_x != null && org.home_y != null) {
        const ruined =
          input.ruinedTiles.size > 0 &&
          input.ruinedTiles.has(`${Math.floor(org.home_x)},${Math.floor(org.home_y)}`)
        const ddx = org.x - org.home_x
        const ddy = org.y - org.home_y
        if (
          !ruined &&
          ddx * ddx + ddy * ddy < 2 &&
          ((org.sleep_debt ?? 0) > 0.4 || org.energy < 0.1 || org.health < 0.15)
        )
          rest = 1
      }
      this.restCandidate[j] = rest

      const i = body.add(0, 0, size, size, this.row[j] * HUMAN_ATLAS_FRAMES, j)
      body.atlas[i] = BODY_ATLAS.people
      body.color[i] = withAlpha(WHITE, fa)
      body.flags[i] = 0
      body.sortKey[i] = org.y
      this.boatIdx[j] = -1
      const boat = boats.get(id)
      this.boatBuilding[j] = boat?.building ? 1 : 0

      const spriteTopOff = -size * 0.78
      // Shadows only when the world is close enough to see them.
      if (detail !== 'overview' && !crowded) {
        soft.push(j, 1, size * 0.2, size * 0.54, size * 0.2, DECAL.disc, 0, withAlpha(BLACK, 0.4 * fa))
      }

      const thought = org.thought ?? ''
      const signalling = thought.startsWith('"') || thought.startsWith("'")
      if (standard && (signalling || thought === 'sounding alarm')) {
        const hot = thought.includes('!') || thought === 'sounding alarm'
        soft.push(
          j,
          0,
          0,
          20,
          20,
          DECAL.ring,
          0,
          withAlpha(hot ? rgba32(255, 68, 136) : rgba32(255, 255, 68), 0.6 * fa),
        )
      } else if (standard && (thought === 'challenging' || thought === 'challenging alone')) {
        const hot = thought === 'challenging'
        soft.push(
          j,
          0,
          0,
          22,
          22,
          DECAL.diamond,
          0,
          withAlpha(hot ? rgba32(255, 34, 0) : rgba32(204, 68, 34), (hot ? 0.85 : 0.7) * fa),
        )
      }
      if (standard && org.infection > 0.15) {
        soft.push(j, 0, 0, 16, 16, DECAL.disc, 0, withAlpha(rgba32(187, 255, 68), org.infection * 0.3 * fa))
      }
      if (isSelected) {
        // a warm halo, then the white dashed ring turning slowly over it
        soft.push(
          j,
          0,
          2,
          size * 0.84,
          size * 0.48,
          DECAL.ring,
          0,
          withAlpha(rgba32(255, 210, 138), 0.35 * fa),
        )
        soft.push(j, 0, 2, size * 0.84, size * 0.48, DECAL.dashed, 0, withAlpha(WHITE, 0.95 * fa), {
          spin: 0.0006,
        })
      }
      if (standard && (!crowded || isSelected) && org.lineage_id) {
        soft.push(
          j,
          0,
          3,
          size * 0.68,
          size * 0.34,
          DECAL.ring,
          0,
          withAlpha(cssToRgba32(lineageColor(org.lineage_id)), fa),
        )
      }

      // Simulation state as a restrained aura behind the character art.
      let bodyFill: string
      if (org.infection > 0.38) bodyFill = 'hsl(85,60%,48%)'
      else if ((org.fear_level ?? 0) > 0.72) bodyFill = 'hsl(10,70%,48%)'
      else if ((org.grief_ticks ?? 0) > 12) bodyFill = 'hsl(220,50%,50%)'
      else if ((org.joy_ticks ?? 0) > 30) bodyFill = 'hsl(45,80%,62%)'
      else if (org.energy < 0.12) bodyFill = 'hsl(38,55%,38%)'
      else bodyFill = THOUGHT_COLORS[org.thought] ?? '#cccccc'
      if (viewFlags.health) {
        const h = Math.max(0, Math.min(1, org.health))
        bodyFill = `rgb(${Math.round(220 * (1 - h) + 80 * h)},${Math.round(80 * (1 - h) + 200 * h)},${Math.round(80 * (1 - h) + 100 * h)})`
      } else if (viewFlags.age) {
        bodyFill =
          stage === 'elder' ? '#e9c87a' : stage === 'infant' || stage === 'child' ? '#8db5d6' : '#b8b8a8'
      }
      if (isSelected || viewFlags.health || viewFlags.age || (standard && !crowded)) {
        const k = viewFlags.health || viewFlags.age ? 0.3 : standard ? 0.16 : 0.1
        const d = 2 * (bodyR + 1.5)
        soft.push(j, 0, 0, d, d, DECAL.disc, 0, withAlpha(cssToRgba32(bodyFill), k * fa))
      }
      if (standard && viewFlags.fear && (org.fear_level ?? 0) > 0.25) {
        const d = 2 * (bodyR + 4)
        const a = Math.min(0.55, (org.fear_level ?? 0) * 0.8)
        soft.push(j, 0, 0, d, d, DECAL.disc, 0, withAlpha(rgba32(220, 70, 70), a * fa))
      }
      if (standard && viewFlags.lineageDot && org.lineage_id) {
        soft.push(
          j,
          0,
          bodyR * 0.4,
          3.2,
          3.2,
          DECAL.disc,
          0,
          withAlpha(cssToRgba32(lineageColor(org.lineage_id)), fa),
        )
      }
      if (standard && viewFlags.pregnancy && org.pregnant) {
        const d = 2 * (bodyR + 2.5)
        soft.push(j, 0, 0, d, d, DECAL.dashed, 0, withAlpha(rgba32(255, 220, 120), 0.9 * fa))
      }

      // A boat under a rider is drawn over the character's feet; added after the loop.
      if (boat) riders.push(j, fa)

      if (standard) {
        const emote = emoteFor(org)
        // The painter's bubble: whole-pixel corner at round(x - 3.5) - 1, bottom 2px above the head.
        if (emote)
          emotes.push(j, -8.5, -bodyR * 2.4 - 12, 16, 16, emoteFrame(emote), 0, withAlpha(WHITE, fa), {
            snap: true,
            bob: this.phase[j],
          })
      }

      const era = input.lineageEras[org.lineage_id] ?? ''
      if (standard && era && era !== 'pre-stone' && era !== 'stone') {
        const color = cssToRgba32(ERA_STRIPE_COLOR[era] ?? 'rgba(255,255,255,0)')
        over.push(j, -bodyR, bodyR + 1, Math.round(bodyR * 2), 1, 0, 0, withAlpha(color, 0.75 * fa), {
          untextured: true,
          snap: true,
        })
      }
      if (org.is_leader) {
        const top = spriteTopOff - 2
        for (const [dx, dy, w, h] of [
          [-4, 0, 8, 2],
          [-4, -2, 2, 2],
          [-1, -3, 2, 3],
          [2, -2, 2, 2],
        ])
          over.push(j, dx, top + dy, w, h, 0, 0, withAlpha(CROWN, fa), { untextured: true, snap: true })
      }
      const glyph = (g: string, dx: number, dy: number, px: number) => {
        const f = glyphFrame(g)
        if (f >= 0) over.push(j, dx, dy, px, px, f, 0, withAlpha(WHITE, fa))
      }
      const specEmoji = SPECIALTY_EMOJI[org.specialty ?? ''] ?? ''
      if (full && specEmoji) glyph(specEmoji, bodyR + 1, -bodyR * 0.4, 8)
      if (standard && org.diseases && org.diseases.length > 0) glyph(SICK_EMOJI, -bodyR - 1, -bodyR * 0.4, 8)
      if (full && org.tools) {
        const tool = pickToolEmoji(org.tools)
        if (tool) glyph(tool, bodyR + 4, bodyR * 0.6, 9)
      }
      if (full && org.degrees && org.degrees.length > 0) glyph(DEGREE_EMOJI, -bodyR - 4, bodyR * 0.6, 8)

      if (standard && org.carrying > 0) {
        over.push(
          j,
          size * 0.2,
          -1,
          5,
          4,
          0,
          0,
          withAlpha(cssToRgba32(org.carrying_type === 2 ? '#9a9a9a' : '#8b5e3c'), fa),
          {
            untextured: true,
            snap: true,
          },
        )
      }

      const showVitals = isSelected || org.energy < 0.22 || org.hydration < 0.22 || org.health < 0.22
      if (showVitals) {
        const barW = Math.max(8, Math.round(size * 0.55))
        const left = -barW / 2
        const top = spriteTopOff - 5
        over.push(j, left - 1, top - 1, barW + 2, 6, 0, 0, withAlpha(BLACK, 0.68 * fa), {
          untextured: true,
          snap: true,
        })
        const bar = (value: number, dy: number, color: string) => {
          const w = Math.round(barW * Math.max(0, Math.min(1, value)))
          if (w > 0)
            over.push(j, left, top + dy, w, 1, 0, 0, withAlpha(cssToRgba32(color), fa), {
              untextured: true,
              snap: true,
            })
        }
        bar(org.energy, 0, '#55dd55')
        bar(org.hydration, 2, '#4499ff')
        bar(org.health, 4, '#ff665c')
      }
      j++
    }
    this.n = j

    // Rider boats follow the people in the layer, so a person's layer index is its slot.
    for (let r = 0; r < riders.length; r += 2) {
      const owner = riders[r]
      const bi = body.add(0, 0, 32, 16, 0, owner)
      body.atlas[bi] = BODY_ATLAS.boats
      body.color[bi] = withAlpha(WHITE, riders[r + 1])
      body.flags[bi] = 0
      body.sortKey[bi] = this.toY[owner] + 0.0004
      this.boatIdx[owner] = bi
    }

    // Boats nobody is in sit on the water, drawn beneath the people.
    for (const v of input.vehicles) {
      if (v.kind !== 'boat' || v.rider_id) continue
      const x = Math.round((v.x - ox) * TILE + TILE / 2)
      const y = Math.round((v.y - oy) * TILE + TILE / 2)
      const bi = body.add(x, y + 3, 32, 16, boatFrame(false, !!v.building, 0), -1)
      body.atlas[bi] = BODY_ATLAS.boats
      body.sortKey[bi] = -10000 + v.y
    }
    this.lastMoved = -Infinity
    this.moving = true
  }

  /** Walk everyone to `t` (0..1 between the previous frame and this one) at wall time `now` (ms). */
  animate(now: number, t: number): boolean {
    const n = this.n
    const body = this.body
    const { fromX, fromY, toX, toY, px, py, size, row, phase, restCandidate, hidden, boatIdx } = this
    const motion = this.motion
    const ox = this.ox
    const oy = this.oy
    const bx = body.x
    const by = body.y
    const bf = body.frame
    const bflags = body.flags
    const bkey = body.sortKey
    const touchAll = this.touchAll
    let anyMoved = false
    // Slots whose drawn values changed this frame: the body is touched from the first to the last of them,
    // so a person standing still costs no write and no repack.
    let lo = n
    let hi = -1
    for (let j = 0; j < n; j++) {
      const x = fromX[j] + (toX[j] - fromX[j]) * t
      const y = fromY[j] + (toY[j] - fromY[j]) * t
      if (motion.step(j, x, y, now)) anyMoved = true
      const cx = (x - ox) * TILE + TILE / 2
      const cy = (y - oy) * TILE + TILE / 2
      px[j] = cx
      py[j] = cy
      const s = size[j]
      const recent = now - motion.movedAt[j] <= 120
      const resting = restCandidate[j] === 1 && !recent
      hidden[j] = resting ? 1 : 0
      const rider = boatIdx[j]
      let changed = storeChanged(bx, j, Math.round(cx - s / 2) + s / 2)
      changed = storeChanged(by, j, Math.round(cy - s * 0.78) + s / 2) || changed
      changed =
        storeChanged(
          bf,
          j,
          row[j] * HUMAN_ATLAS_FRAMES + (rider >= 0 ? 0 : motion.frame(j, now, phase[j], HUMAN_ATLAS_FRAMES)),
        ) || changed
      changed =
        storeChanged(bflags, j, (motion.flipped[j] ? SPRITE_FLIP_X : 0) | (resting ? SPRITE_HIDDEN : 0)) ||
        changed
      changed = storeChanged(bkey, j, y) || changed
      if (changed || touchAll) {
        if (j < lo) lo = j
        if (j > hi) hi = j
      }
      if (rider >= 0) {
        const moving = !this.boatBuilding[j] && recent
        let riderChanged = storeChanged(bx, rider, Math.round(cx))
        riderChanged = storeChanged(by, rider, Math.round(cy) + 3) || riderChanged
        riderChanged =
          storeChanged(bf, rider, boatFrame(moving, this.boatBuilding[j] === 1, now)) || riderChanged
        riderChanged = storeChanged(bflags, rider, resting ? SPRITE_HIDDEN : 0) || riderChanged
        riderChanged = storeChanged(bkey, rider, y + 0.0004) || riderChanged
        if (riderChanged || touchAll) {
          if (rider < lo) lo = rider
          if (rider > hi) hi = rider
        }
      }
    }
    if (touchAll) body.touch()
    else if (hi >= lo) body.touchRange(lo, hi)
    this.soft.place(px, py, hidden, now, touchAll)
    this.over.place(px, py, hidden, now, touchAll)
    this.emotes.place(px, py, hidden, now, touchAll)
    if (anyMoved) this.lastMoved = now
    // Keep animating a moment after the last step so the walk settles on frame 0.
    this.moving = now - this.lastMoved < 400
    return this.moving
  }
}
