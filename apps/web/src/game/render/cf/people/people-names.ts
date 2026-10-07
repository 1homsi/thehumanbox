import { TextLayer } from 'cubeforge'
import { storeChanged } from '../attached'

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

/**
 * Names and thoughts above the people, drawn by a cubeforge `TextLayer` instead of canvas text: one run per
 * label, laid out once and rasterised crisply at the zoom (`zoomAware`), where the canvas painter sent nine
 * sprites per character every frame.
 *
 * The painter calls `text()` for each label in the order it draws them, between `begin()` and `end()`. A run
 * keeps its slot from frame to frame (the painter's order is stable), so only runs whose text, position, style
 * or alpha changed are written, and the layer is touched once if any changed. Runs past the last label are
 * removed.
 */
export class PeopleNameLayer {
  readonly layer: TextLayer
  private readonly styleIds: Record<NameStyle, number>
  private used = 0
  private changed = false

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
  text(text: string, x: number, y: number, style: NameStyle, alpha: number): void {
    const layer = this.layer
    const look = LOOKS[style]
    const runAlpha = alpha * look.alpha
    const styleId = this.styleIds[style]
    const k = this.used++
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
