import { TextLayer } from 'xipjs'
import { storeChanged } from '../attached'
import type { PeopleLabelSource } from './people-labels'

/** The four looks of a name tag and a thought, as the canvas painter drew them. */
export type NameStyle = 'name' | 'nameSelected' | 'thought' | 'thoughtSelected'

interface NameLook {
  fontSize: number
  weight: string
  /** Fill colour as the painter used it, before the look's own alpha. */
  color: string
  outlineWidth: number
  /** The look's own alpha (the painter's fill colour alpha), multiplied by the person's focus alpha. */
  alpha: number
}

const OUTLINE = 'rgba(0,0,0,0.85)'
const LOOKS: Record<NameStyle, NameLook> = {
  name: { fontSize: 9, weight: 'normal', color: '#ffffff', outlineWidth: 3, alpha: 0.95 },
  nameSelected: { fontSize: 10, weight: 'bold', color: '#ffffff', outlineWidth: 3, alpha: 1 },
  thought: { fontSize: 8, weight: 'normal', color: 'rgb(180,220,255)', outlineWidth: 2.5, alpha: 0.9 },
  thoughtSelected: { fontSize: 8, weight: 'normal', color: 'rgb(180,220,255)', outlineWidth: 2.5, alpha: 1 },
}

function styleOf(look: NameLook) {
  return {
    fontFamily: 'monospace',
    fontSize: look.fontSize,
    weight: look.weight,
    color: look.color,
    outlineColor: OUTLINE,
    outlineWidth: look.outlineWidth,
  }
}

/**
 * Feeds name and thought labels into a WebGL `TextLayer` so they draw with the other sprites
 * without per-frame canvas context switches. The layer is owned by `CfOverlayRenderer`.
 */
export class PeopleNameLayer {
  readonly layer: TextLayer
  private readonly styleIds: Record<NameStyle, number>
  private used = 0
  private changed = false
  private slots = new Int32Array(0)
  private dx = new Float32Array(0)
  private dy = new Float32Array(0)

  constructor(layer: TextLayer) {
    this.layer = layer
    this.styleIds = {
      name: layer.addStyle(styleOf(LOOKS.name)),
      nameSelected: layer.addStyle(styleOf(LOOKS.nameSelected)),
      thought: layer.addStyle(styleOf(LOOKS.thought)),
      thoughtSelected: layer.addStyle(styleOf(LOOKS.thoughtSelected)),
    }
  }

  begin(): void {
    this.used = 0
    this.changed = false
  }

  /** A label centred on `x`, its bottom at `y`. `alpha` is the person's focus alpha (1 or 0.12). */
  text(text: string, x: number, y: number, style: NameStyle, alpha: number, slot: number): void {
    const layer = this.layer
    const look = LOOKS[style]
    const runAlpha = alpha * look.alpha
    const styleId = this.styleIds[style]
    const k = this.used++
    this.ensure(k + 1)
    this.slots[k] = slot
    const org = this.currentPeople?.orgs[slot]
    const size = this.spriteSize(org, this.currentPeople?.radius?.[slot])
    const personX = this.currentPeople?.px[slot] ?? x
    const spriteX = Math.trunc(Math.round(personX - size / 2) + size / 2)
    const spriteY = Math.round((this.currentPeople?.py[slot] ?? y) - size * 0.78)
    this.dx[k] = x - spriteX
    this.dy[k] = y - spriteY
    if (k >= layer.count) {
      layer.add(text, x, y, { style: styleId, alpha: runAlpha, anchorX: 0.5, anchorY: 1, align: 'center' })
      this.changed = true
      return
    }
    let c = false
    if (layer.texts[k] !== text) {
      layer.setText(k, text)
      c = true
    }
    c = storeChanged(layer.x, k, x) || c
    c = storeChanged(layer.y, k, y) || c
    c = storeChanged(layer.style, k, styleId) || c
    c = storeChanged(layer.alpha, k, runAlpha) || c
    if (c) this.changed = true
  }

  private currentPeople: PeopleLabelSource | null = null

  /** Follow the sprite's interpolated position on each render frame without rebuilding label runs. */
  follow(people: PeopleLabelSource | null): void {
    this.currentPeople = people
    if (!people) return
    const layer = this.layer
    let moved = false
    for (let k = 0; k < this.used; k++) {
      const slot = this.slots[k]!
      const org = people.orgs[slot]
      if (!org) continue
      const size = this.spriteSize(org, people.radius?.[slot])
      const x = Math.trunc(Math.round(people.px[slot]! - size / 2) + size / 2) + this.dx[k]!
      const y = Math.round(people.py[slot]! - size * 0.78) + this.dy[k]!
      moved = storeChanged(layer.x, k, x) || moved
      moved = storeChanged(layer.y, k, y) || moved
    }
    if (moved) layer.touch()
  }

  private ensure(size: number): void {
    if (this.slots.length >= size) return
    const capacity = Math.max(size, this.slots.length * 2, 32)
    const slots = new Int32Array(capacity)
    const dx = new Float32Array(capacity)
    const dy = new Float32Array(capacity)
    slots.set(this.slots)
    dx.set(this.dx)
    dy.set(this.dy)
    this.slots = slots
    this.dx = dx
    this.dy = dy
  }

  private spriteSize(org: PeopleLabelSource['orgs'][number] | undefined, radius?: number): number {
    if (!org) return 19
    const bodyRadius = radius ?? 5
    const bodyR = bodyRadius * (org.sex === 'male' ? 1.05 : 0.95)
    return Math.round(Math.max(19, bodyR * 3.8))
  }

  end(): void {
    const layer = this.layer
    let trimmed = false
    while (layer.count > this.used) {
      layer.removeAt(layer.count - 1)
      trimmed = true
    }
    if (this.changed || trimmed) layer.touch()
  }
}
