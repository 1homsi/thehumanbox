// Town and city names on the world map. They keep a readable size on screen
// however far out the camera is, the most important places claim their spot
// first, and a name that would overlap another moves aside or waits until
// the player zooms in. They draw above people and buildings, on a small
// plaque, so a busy town centre cannot swallow them.

type Ctx = CanvasRenderingContext2D

export interface SettlementLabel {
  /** Anchor in map pixels: the middle of the settlement. */
  x: number
  y: number
  title: string
  sub: string
  major: boolean
  /** Higher claims its place first. */
  priority: number
  color: string
  /** A tribe on the brink: red rule and subtitle. */
  alert?: boolean
}

export interface PlacedLabel extends SettlementLabel {
  /** Centre of the plaque in map pixels. */
  cx: number
  cy: number
  w: number
  h: number
  scale: number
}

/** Map-pixel scale that keeps labels at least their design size on screen. */
export function labelScale(zoom: number): number {
  return Math.max(1, 1 / Math.max(0.05, zoom))
}

export function titleFont(major: boolean, scale: number): string {
  return major ? `bold ${Math.round(12 * scale)}px monospace` : `${Math.round(10 * scale)}px monospace`
}

export function subFont(scale: number): string {
  return `${Math.round(8 * scale)}px monospace`
}

/** Plaque size in design pixels, before scaling. */
const PAD_X = 4
const TITLE_H = 13
const SUB_H = 9
/** Gap kept between plaques, in design pixels. */
const GAP = 2

/**
 * Place labels without overlaps, most important first. Each tries its own
 * spot above the settlement, then just below it, then a step higher; one
 * that fits nowhere is left out for now. `measure` gives a text's width in
 * design pixels for the title (major or not) or the subtitle.
 */
export function placeSettlementLabels(
  labels: readonly SettlementLabel[],
  scale: number,
  measure: (text: string, kind: 'major' | 'minor' | 'sub') => number,
  bounds: { w: number; h: number },
  lift: number,
): PlacedLabel[] {
  const order = [...labels].sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
  const placed: PlacedLabel[] = []
  for (const label of order) {
    const textW = Math.max(measure(label.title, label.major ? 'major' : 'minor'), measure(label.sub, 'sub'))
    const w = (textW + PAD_X * 2) * scale
    const h = (TITLE_H + SUB_H) * scale
    const gap = GAP * scale
    const above = label.y - lift - h / 2
    for (const cy of [above, label.y + lift + h / 2, above - h - gap]) {
      const cx = Math.min(Math.max(label.x, w / 2 + 2), Math.max(bounds.w - w / 2 - 2, w / 2 + 2))
      const y = Math.max(cy, h / 2 + 2)
      const clash = placed.some(
        (p) => Math.abs(p.cx - cx) * 2 < p.w + w + gap * 2 && Math.abs(p.cy - y) * 2 < p.h + h + gap * 2,
      )
      if (!clash) {
        placed.push({ ...label, cx, cy: y, w, h, scale })
        break
      }
    }
  }
  return placed
}

/** Draw placed labels: a dark plaque, the name, and its population line. */
export function drawSettlementLabels(ctx: Ctx, placed: readonly PlacedLabel[]) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of placed) {
    const left = Math.round(p.cx - p.w / 2)
    const top = Math.round(p.cy - p.h / 2)
    ctx.fillStyle = 'rgba(22,17,11,0.66)'
    ctx.fillRect(left, top, Math.round(p.w), Math.round(p.h))
    if (p.major || p.alert) {
      ctx.fillStyle = p.alert ? 'rgba(255,110,90,0.85)' : 'rgba(255,210,138,0.45)'
      ctx.fillRect(left, top, Math.round(p.w), Math.max(1, Math.round(p.scale)))
    }
    const titleY = top + (TITLE_H / 2 + 1) * p.scale
    ctx.font = titleFont(p.major, p.scale)
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillText(p.title, p.cx + p.scale, titleY + p.scale)
    ctx.fillStyle = p.color
    ctx.fillText(p.title, p.cx, titleY)
    ctx.font = subFont(p.scale)
    ctx.fillStyle = p.alert ? '#ff9f8c' : '#a99d86'
    ctx.fillText(p.sub, p.cx, top + (TITLE_H + SUB_H / 2) * p.scale)
  }
  ctx.restore()
}
