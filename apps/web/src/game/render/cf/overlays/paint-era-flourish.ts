import { TILE } from '../../../model/palette'
import { FLOURISH_TICKS, type EraChange } from '../../../model/era-flourish'
import type { CfFrame } from './frame'

type Ctx = CanvasRenderingContext2D

const GOLD = '#ffd96a'
const INK = '#1b1510'
const RINGS = 3
const RING_STEP = 0.12

/**
 * Marks a tribe that has just entered a new era: gold rings spread out from its settlement and a plate
 * over it names the age. It runs for `FLOURISH_TICKS` world ticks, then the map is as it was.
 */
export function paintEraFlourish(ctx: Ctx, f: CfFrame, changes: readonly EraChange[]): void {
  const { world, ox, oy, W, H } = f
  for (const change of changes) {
    const age = (world.tick - change.tick) / FLOURISH_TICKS
    if (age < 0 || age >= 1) continue
    const settlement = largestSettlement(world.settlements, change.lineage)
    if (!settlement) continue
    const cx = (settlement.center[0] - ox) * TILE + TILE / 2
    const cy = (settlement.center[1] - oy) * TILE + TILE / 2
    if (cx < -80 || cx > W + 80 || cy < -80 || cy > H + 80) continue

    // The rings grow with the map (world units). The plate is a screen-sized label: the map is drawn
    // zoomed, so its sizes are divided by the zoom to stay readable at every zoom.
    const s = 1 / Math.max(1, f.zoom)
    ctx.save()
    ctx.strokeStyle = GOLD
    for (let i = 0; i < RINGS; i++) {
      const q = age - i * RING_STEP
      if (q < 0 || q > 1) continue
      ctx.globalAlpha = (1 - q) * 0.9
      ctx.lineWidth = 2 - q
      ctx.beginPath()
      ctx.arc(cx, cy, 6 + q * 46, 0, Math.PI * 2)
      ctx.stroke()
    }

    // The plate fades in quickly and out over the last third of its time.
    const alpha = Math.min(1, age * 8) * Math.min(1, (1 - age) / 0.3)
    const name = world.lineage_names?.[change.lineage] ?? settlement.name ?? change.lineage.slice(0, 6)
    const text = `${name} · ${change.era.toUpperCase()} AGE`
    const font = 13 * s
    const width = (text.length * 7.6 + 16) * s
    const height = 20 * s
    // Below the settlement: its name label sits above it.
    const top = cy + 40 * s
    ctx.font = `bold ${font.toFixed(2)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = alpha * 0.9
    ctx.fillStyle = INK
    ctx.fillRect(cx - width / 2, top - height / 2, width, height)
    ctx.globalAlpha = alpha
    ctx.fillStyle = GOLD
    ctx.fillText(text, cx, top)
    ctx.restore()
  }
}

/** The settlement a tribe is known by: its biggest one (`settlements` lists them all). */
function largestSettlement(
  settlements: CfFrame['world']['settlements'],
  lineage: string,
): { center: [number, number]; name?: string } | null {
  let best: { center: [number, number]; name?: string; population: number } | null = null
  for (const s of settlements ?? []) {
    if (s.lineage_id !== lineage) continue
    if (!best || s.population > best.population) best = s
  }
  return best
}
