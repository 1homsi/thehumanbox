import { SPRITE_HIDDEN, SPRITE_UNTEXTURED, type SpriteLayer } from 'cubeforge'

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

  /** Move every attached sprite to its owner. `hidden[o]` hides the owner's sprites. */
  place(ownerX: Float32Array, ownerY: Float32Array, hidden: Uint8Array, now: number): void {
    const layer = this.layer
    const { x, y, w, h, flags, rotation } = layer
    for (let k = 0; k < this.count; k++) {
      const o = this.owner[k]
      if (hidden[o] !== 0) {
        flags[k] |= SPRITE_HIDDEN
        continue
      }
      flags[k] &= ~SPRITE_HIDDEN
      if (this.snap[k] !== 0) {
        x[k] = Math.round(ownerX[o] + this.offX[k]) + w[k] / 2
        y[k] = Math.round(ownerY[o] + this.offY[k]) + h[k] / 2
        if (this.bob[k] === this.bob[k]) y[k] += Math.round(Math.sin(now / 420 + this.bob[k]) * 1.2)
      } else {
        x[k] = ownerX[o] + this.offX[k]
        y[k] = ownerY[o] + this.offY[k]
      }
      if (this.spin[k] !== 0) rotation[k] = now * this.spin[k]
    }
    layer.touch()
  }
}
