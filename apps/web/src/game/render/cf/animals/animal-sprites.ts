import { SPRITE_FLIP_X, SPRITE_HIDDEN, type SpriteLayer } from 'cubeforge'
import type { AnimalState } from '../../../../shared/types'
import { TILE } from '../../../model/palette'
import { animalBob, animalMoving, animalSize, animalStep, isFlyer } from '../../animal-visuals'
import { pixelFaunaDims, hasPixelFauna } from '../../pixel-fauna'
import {
  DECAL,
  FAUNA_CELL,
  FAUNA_KINDS,
  PIXEL_FAUNA_CELL,
  SLEEP_GLYPH,
  faunaCellKind,
  faunaDrawSize,
  glyphFrame,
  pixelFaunaFrame,
  pixelFaunaOffset,
} from '../atlas-bake'
import { AttachedSprites } from '../attached'
import { rgba32, withAlpha } from '../colors'
import { MotionStore } from '../motion'

export const ANIMAL_ATLAS = { pixel: 0, fauna: 1 } as const

export interface AnimalFrameInput {
  animals: readonly AnimalState[]
  prevAnimals: readonly AnimalState[] | null
  ox: number
  oy: number
}

const BLACK = rgba32(0, 0, 0)
const WHITE = 0xffffffff

/**
 * Wild animals and monsters as SpriteLayers, from typed arrays.
 *  - `shadow`: ellipses under everything but fish and birds
 *  - `body`:   depth-sorted animals
 *  - `sleep`:  a drifting 'z' over each sleeper
 */
export class AnimalSprites {
  readonly body: SpriteLayer
  readonly sleep: SpriteLayer
  readonly shadow: AttachedSprites

  n = 0
  private cap = 0
  private kinds: string[] = []
  private animalIds = new Int32Array(0)
  private fromX = new Float64Array(0)
  private fromY = new Float64Array(0)
  private toX = new Float64Array(0)
  private toY = new Float64Array(0)
  private size = new Uint8Array(0)
  /** 0 nothing to draw, 1 ASCII pixel art, 2 cut from the fauna sheet. */
  private mode = new Uint8Array(0)
  private base = new Uint16Array(0)
  private scale = new Uint8Array(0)
  private cols = new Uint8Array(0)
  private rows = new Uint8Array(0)
  private offX = new Uint8Array(0)
  private offY = new Uint8Array(0)
  private cutH = new Uint8Array(0)
  private px = new Float32Array(0)
  private py = new Float32Array(0)
  private noShadow = new Uint8Array(0)
  private hiddenArr = new Uint8Array(0)
  private sleepers: number[] = []
  private motion = new MotionStore()
  private oldMotion = new MotionStore()
  private index = new Map<number, number>()
  private oldIndex = new Map<number, number>()
  private prevSource: readonly AnimalState[] | null = null
  private prevById = new Map<number, AnimalState>()
  private ox = 0
  private oy = 0

  constructor(layers: { body: SpriteLayer; shadow: SpriteLayer; sleep: SpriteLayer }) {
    this.body = layers.body
    this.sleep = layers.sleep
    this.shadow = new AttachedSprites(layers.shadow)
  }

  private reserve(n: number): void {
    if (n <= this.cap) return
    const cap = Math.max(n, this.cap * 2, 128)
    const grow = <T extends Float64Array | Float32Array | Uint8Array | Uint16Array | Int32Array>(
      old: T,
      make: new (len: number) => T,
    ): T => {
      const next = new make(cap)
      next.set(old)
      return next
    }
    this.animalIds = grow(this.animalIds, Int32Array)
    this.fromX = grow(this.fromX, Float64Array)
    this.fromY = grow(this.fromY, Float64Array)
    this.toX = grow(this.toX, Float64Array)
    this.toY = grow(this.toY, Float64Array)
    this.size = grow(this.size, Uint8Array)
    this.mode = grow(this.mode, Uint8Array)
    this.base = grow(this.base, Uint16Array)
    this.scale = grow(this.scale, Uint8Array)
    this.cols = grow(this.cols, Uint8Array)
    this.rows = grow(this.rows, Uint8Array)
    this.offX = grow(this.offX, Uint8Array)
    this.offY = grow(this.offY, Uint8Array)
    this.cutH = grow(this.cutH, Uint8Array)
    this.px = grow(this.px, Float32Array)
    this.py = grow(this.py, Float32Array)
    this.noShadow = grow(this.noShadow, Uint8Array)
    this.hiddenArr = grow(this.hiddenArr, Uint8Array)
    this.motion.reserve(cap)
    this.oldMotion.reserve(cap)
    this.cap = cap
  }

  rebuild(input: AnimalFrameInput): void {
    const { animals, ox, oy } = input
    this.ox = ox
    this.oy = oy
    if (input.prevAnimals !== this.prevSource) {
      this.prevSource = input.prevAnimals
      this.prevById.clear()
      if (input.prevAnimals) for (const a of input.prevAnimals) this.prevById.set(a.id, a)
    }
    const tmp = this.oldMotion
    this.oldMotion = this.motion
    this.motion = tmp
    const tmpIndex = this.oldIndex
    this.oldIndex = this.index
    this.index = tmpIndex
    this.index.clear()

    let count = 0
    for (const a of animals) if (!a.away) count++
    this.reserve(count)
    const { body, shadow } = this
    body.clear()
    shadow.begin()
    this.kinds.length = 0
    this.sleepers.length = 0

    let j = 0
    for (const a of animals) {
      if (a.away) continue
      this.kinds.push(a.kind)
      this.animalIds[j] = a.id
      this.index.set(a.id, j)
      this.toX[j] = a.x
      this.toY[j] = a.y
      const p = this.prevById.get(a.id)
      this.fromX[j] = p ? p.x : a.x
      this.fromY[j] = p ? p.y : a.y
      const old = this.oldIndex.get(a.id)
      if (old !== undefined) this.motion.copyFrom(this.oldMotion, old, j)
      else this.motion.init(j, this.fromX[j], this.fromY[j])

      const size = animalSize(a.kind)
      this.size[j] = size
      let w = 0
      let h = 0
      let frame = 0
      let atlas: number = ANIMAL_ATLAS.pixel
      if (hasPixelFauna(a.kind)) {
        const d = pixelFaunaDims(a.kind)!
        const scale = Math.max(1, Math.round(size / d.cols))
        const off = pixelFaunaOffset(a.kind)
        this.mode[j] = 1
        this.scale[j] = scale
        this.cols[j] = d.cols
        this.rows[j] = d.rows
        this.offX[j] = off.x
        this.offY[j] = off.y
        this.base[j] = pixelFaunaFrame(a.kind, 0)
        w = h = PIXEL_FAUNA_CELL * scale
        frame = this.base[j]
      } else {
        const cut = faunaCellKind(a.kind, a.id)
        if (cut) {
          const d = faunaDrawSize(cut)
          this.mode[j] = 2
          this.cutH[j] = d.h
          this.base[j] = FAUNA_KINDS.indexOf(cut)
          w = h = FAUNA_CELL
          frame = this.base[j]
          atlas = ANIMAL_ATLAS.fauna
        } else this.mode[j] = 0
      }
      const i = body.add(0, 0, w, h, frame, a.id)
      body.atlas[i] = atlas
      body.color[i] = WHITE
      body.flags[i] = this.mode[j] === 0 ? SPRITE_HIDDEN : 0
      body.sortKey[i] = a.y
      this.noShadow[j] = a.kind === 'fish' || a.kind === 'bird' ? 1 : 0
      if (this.noShadow[j] === 0 && this.mode[j] !== 0) {
        const flyer = isFlyer(a.kind)
        shadow.push(
          j,
          0,
          size * (flyer ? 0.9 : 0.42),
          2 * size * (flyer ? 0.24 : 0.32),
          2 * size * (flyer ? 0.1 : 0.14),
          DECAL.disc,
          0,
          withAlpha(BLACK, flyer ? 0.18 : 0.3),
        )
      }
      if (a.sleeping) this.sleepers.push(j)
      j++
    }
    this.n = j

    const sleep = this.sleep
    sleep.clear()
    for (const owner of this.sleepers) {
      const i = sleep.add(0, 0, 8, 8, glyphFrame(SLEEP_GLYPH), this.animalIds[owner])
      sleep.color[i] = WHITE
    }
  }

  animate(now: number, t: number): void {
    const n = this.n
    const { body, motion, fromX, fromY, toX, toY, px, py, size, mode, base, scale, cols, rows, offX, offY } =
      this
    const { cutH, kinds, animalIds, hiddenArr } = this
    const bx = body.x
    const by = body.y
    const bf = body.frame
    const bflags = body.flags
    const ox = this.ox
    const oy = this.oy
    for (let j = 0; j < n; j++) {
      const x = fromX[j] + (toX[j] - fromX[j]) * t
      const y = fromY[j] + (toY[j] - fromY[j]) * t
      motion.step(j, x, y, now)
      const kind = kinds[j]
      const moving = animalMoving(kind, now, motion.movedAt[j])
      const s = size[j]
      const cx = (x - ox) * TILE + TILE / 2
      const cy = (y - oy) * TILE + TILE / 2 + animalBob(kind, animalIds[j], moving, now)
      px[j] = cx
      py[j] = cy
      body.sortKey[j] = y
      const flip = motion.flipped[j] === 1
      const step = animalStep(animalIds[j], moving, now)
      hiddenArr[j] = 0
      if (mode[j] === 1) {
        const sc = scale[j]
        const W = cols[j] * sc
        const H = rows[j] * sc
        const x0 = Math.round(cx - W / 2)
        const y0 = Math.round(cy - H / 2)
        const left = flip ? PIXEL_FAUNA_CELL - offX[j] - cols[j] : offX[j]
        bx[j] = x0 + (PIXEL_FAUNA_CELL / 2 - left) * sc
        by[j] = y0 + (PIXEL_FAUNA_CELL / 2 - offY[j]) * sc
        bf[j] = base[j] + step
      } else if (mode[j] === 2) {
        const h = cutH[j]
        const top = kind === 'fish' ? cy - h / 2 : cy + s * 0.42 - h
        bx[j] = Math.round(cx)
        by[j] = Math.round(top) + Math.round(h / 2)
        bf[j] = base[j]
      }
      bflags[j] = flip ? SPRITE_FLIP_X : mode[j] === 0 ? SPRITE_HIDDEN : 0
    }
    body.touch()
    this.shadow.place(px, py, hiddenArr, now)
    const sleep = this.sleep
    for (let k = 0; k < this.sleepers.length; k++) {
      const j = this.sleepers[k]
      const rise = ((now / 1800 + animalIds[j] * 0.37) % 1) * 6
      sleep.x[k] = px[j] + rise * 0.6
      sleep.y[k] = py[j] - size[j] * 0.55 - rise
      sleep.color[k] = withAlpha(WHITE, 0.85 - rise / 10)
    }
    sleep.touch()
  }
}
