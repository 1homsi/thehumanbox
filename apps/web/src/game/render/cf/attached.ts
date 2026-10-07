import { SPRITE_HIDDEN, SPRITE_UNTEXTURED, type SpriteLayer } from 'cubeforge'

type Slots = Float32Array | Float64Array | Uint8Array | Uint32Array

/**
 * Write `v` into `arr[i]` and report whether the stored value changed. The write always happens (it is
 * the left operand of every `store(...) || changed` chain), so the stored value is the rounded one a
 * Float32Array keeps, and a layer is only touched for the slots that really differ.
 */
export function storeChanged(arr: Slots, i: number, v: number): boolean {
  const old = arr[i]
  arr[i] = v
  return arr[i] !== old
}

/**
 * Sprites that ride along with an owner sprite (a shadow, a ring, a health
 * bar). The owner supplies a position every frame; each attached sprite keeps a
 * fixed offset from it. Offsets are for the sprite's centre, except `snap`
 * ones, which are whole-pixel rects that give the offset of their top-left
 * corner and are rounded in world space the way the canvas painter rounds.
 */
export class AttachedSprites {
  count = 0
  owner = new Int32Array(0)
  offX = new Float32Array(0)
  offY = new Float32Array(0)
  snap = new Uint8Array(0)
  /** Per-frame rotation in radians per millisecond (0 = static). */
  spin = new Float32Array(0)
  /** Phase of a one-pixel bob (the emote bubble's), or NaN for none. */
  bob = new Float32Array(0)

  readonly layer: SpriteLayer

  constructor(layer: SpriteLayer) {
    this.layer = layer
  }

  begin(): void {
    this.count = 0
    this.layer.clear()
  }

  push(
    owner: number,
    offX: number,
    offY: number,
    w: number,
    h: number,
    frame: number,
    atlas: number,
    color: number,
    options: { untextured?: boolean; snap?: boolean; spin?: number; bob?: number } = {},
  ): number {
    const i = this.layer.add(0, 0, w, h, frame)
    const k = this.count++
    if (k >= this.owner.length) this.grow(Math.max(64, this.owner.length * 2))
    this.owner[k] = owner
    this.offX[k] = offX
    this.offY[k] = offY
    this.snap[k] = options.snap ? 1 : 0
    this.spin[k] = options.spin ?? 0
    this.bob[k] = options.bob ?? NaN
    const layer = this.layer
    layer.atlas[i] = atlas
    layer.color[i] = color
    layer.flags[i] = options.untextured ? SPRITE_UNTEXTURED : 0
    layer.ids[i] = owner
    return i
  }

  private grow(capacity: number): void {
    const copy = <T extends Float32Array | Int32Array | Uint8Array>(
      old: T,
      make: new (n: number) => T,
    ): T => {
      const next = new make(capacity)
      next.set(old)
      return next
    }
    this.owner = copy(this.owner, Int32Array)
    this.offX = copy(this.offX, Float32Array)
    this.offY = copy(this.offY, Float32Array)
    this.snap = copy(this.snap, Uint8Array)
    this.spin = copy(this.spin, Float32Array)
    this.bob = copy(this.bob, Float32Array)
  }

  /**
   * Move every attached sprite to its owner. `hidden[o]` hides the owner's sprites. Only the sprites whose
   * position, rotation or visibility changed are touched (a range from the first to the last of them);
   * `touchAll` touches the whole layer, as a reference for tests.
   */
  place(ownerX: Float32Array, ownerY: Float32Array, hidden: Uint8Array, now: number, touchAll = false): void {
    const layer = this.layer
    const { x, y, w, h, flags, rotation } = layer
    let lo = this.count
    let hi = -1
    for (let k = 0; k < this.count; k++) {
      const o = this.owner[k]
      let changed: boolean
      if (hidden[o] !== 0) {
        changed = storeChanged(flags, k, flags[k] | SPRITE_HIDDEN)
      } else {
        let nx: number
        let ny: number
        if (this.snap[k] !== 0) {
          nx = Math.round(ownerX[o] + this.offX[k]) + w[k] / 2
          ny = Math.round(ownerY[o] + this.offY[k]) + h[k] / 2
          if (this.bob[k] === this.bob[k]) ny += Math.round(Math.sin(now / 420 + this.bob[k]) * 1.2)
        } else {
          nx = ownerX[o] + this.offX[k]
          ny = ownerY[o] + this.offY[k]
        }
        changed = storeChanged(x, k, nx)
        changed = storeChanged(y, k, ny) || changed
        changed = storeChanged(flags, k, flags[k] & ~SPRITE_HIDDEN) || changed
        if (this.spin[k] !== 0) changed = storeChanged(rotation, k, now * this.spin[k]) || changed
      }
      if (changed) {
        if (k < lo) lo = k
        if (k > hi) hi = k
      }
    }
    if (touchAll) layer.touch()
    else if (hi >= lo) layer.touchRange(lo, hi)
  }
}
