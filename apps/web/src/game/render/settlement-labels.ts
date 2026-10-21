import { INK, hex } from './art-palette'

type Ctx = CanvasRenderingContext2D

// The palette has no parchment highlight yet; keep this local until the shared palette is updated.
export const PARCHMENT_HALO = 'rgba(236, 220, 181, 0.92)'
const measureCache = new Map<string, Map<string, number>>()

export interface SettlementLabel {
  /** Anchor in map pixels: the middle of the settlement. */
  x: number
  y: number
  title: string
  sub: string
  major: boolean
  rank: number
  /** Higher claims its place first. */
  priority: number
  alpha: number
  /** A tribe on the brink: red rule and subtitle. */
  alert?: boolean
}

export interface PlacedLabel extends SettlementLabel {
  /** Centre of the lettering in map pixels. */
  cx: number
  cy: number
  w: number
  h: number
  scale: number
}

/** Keep lettering a steady screen size while allowing rank to set its weight. */
export function labelScale(zoom: number): number {
  return Math.max(0.75, 1 / Math.max(0.05, zoom))
}

export type LabelKind = 'city' | 'town' | 'hamlet'

/** Which lettering a settlement gets. Placement measures and drawing use the same kind, so widths agree. */
export function labelKind(rank: number): LabelKind {
  return rank >= 5 ? 'city' : rank >= 3 ? 'town' : 'hamlet'
}

/**
 * Lettering size in screen pixels. Sized for the mid zoom players spend most time at: ink lettering has
 * to hold over busy towns and roads, which the old boxed plates did by covering them.
 */
const SIZE: Record<LabelKind, number> = { city: 17, town: 14, hamlet: 11 }
/** Old maps space their capitals out, the bigger names more. */
const SPACING: Record<LabelKind, number> = { city: 3, town: 2, hamlet: 1 }

export function titleFont(kind: LabelKind, scale: number): string {
  return `bold ${(SIZE[kind] * scale).toFixed(2)}px monospace`
}

export function titleSpacing(kind: LabelKind, scale: number): string {
  return `${(SPACING[kind] * scale).toFixed(2)}px`
}

export function subFont(scale: number): string {
  return `bold ${(10 * scale).toFixed(2)}px monospace`
}

/** Place names without overlap, most important first. */
export function placeSettlementLabels(
  labels: readonly SettlementLabel[],
  scale: number,
  /** Width of `text` in the kind's title font at scale 1, without letter spacing. */
  measure: (text: string, kind: LabelKind) => number,
  bounds: { w: number; h: number },
  lift: number,
): PlacedLabel[] {
  const order = [...labels].sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
  const placed: PlacedLabel[] = []
  for (const label of order) {
    const kind = labelKind(label.rank)
    let widths = measureCache.get(kind)
    if (!widths) measureCache.set(kind, (widths = new Map()))
    let textWidth = widths.get(label.title)
    if (textWidth === undefined) {
      textWidth = measure(label.title, kind)
      widths.set(label.title, textWidth)
      if (widths.size > 4096) widths.clear()
    }
    const w = (textWidth + SPACING[kind] * Math.max(0, label.title.length - 1)) * scale
    const h = SIZE[kind] * scale + 4 * scale
    const gap = 2 * scale
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

/** Draw map lettering with a parchment halo so it holds over land, roads and water. */
export function drawSettlementLabels(ctx: Ctx, placed: readonly PlacedLabel[]) {
  if (placed.length === 0) return
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of placed) {
    const kind = labelKind(p.rank)
    ctx.globalAlpha = p.alpha
    ctx.font = titleFont(kind, p.scale)
    ctx.letterSpacing = titleSpacing(kind, p.scale)
    ctx.lineJoin = 'round'
    ctx.lineWidth = p.scale * 3.5
    ctx.strokeStyle = PARCHMENT_HALO
    ctx.strokeText(p.title, Math.round(p.cx), Math.round(p.cy))
    ctx.fillStyle = hex(INK)
    ctx.fillText(p.title, Math.round(p.cx), Math.round(p.cy))
    if (p.alert && p.sub) {
      ctx.font = subFont(p.scale)
      ctx.letterSpacing = '0px'
      ctx.lineWidth = p.scale * 3
      ctx.strokeStyle = PARCHMENT_HALO
      ctx.strokeText(p.sub, Math.round(p.cx), Math.round(p.cy + p.h / 2))
      ctx.fillStyle = '#8f3428'
      ctx.fillText(p.sub, Math.round(p.cx), Math.round(p.cy + p.h / 2))
    }
  }
  ctx.globalAlpha = 1
  ctx.restore()
}
