// A tribe's festival, where it is held: a bonfire at the centre, a ring of
// bunting around it in the tribe's colour, and sparks rising. It lights up
// as the festival begins and dims as it ends.

import type { FestivalInfo } from '../../types'

type Ctx = CanvasRenderingContext2D

/** Festival strength from 0 to 1 across its length: quick to light, slow to fade. */
export function festivalGlow(f: Pick<FestivalInfo, 'started' | 'ends'>, tick: number): number {
  const start = f.started ?? tick
  const end = f.ends ?? tick + 1
  const span = Math.max(1, end - start)
  const p = Math.max(0, Math.min(1, (tick - start) / span))
  return p < 0.1 ? p / 0.1 : 1 - (p - 0.1) * 0.7
}

/** A short line for a card: "Harvest Feast". */
export function festivalLabel(
  festivals: readonly FestivalInfo[] | undefined,
  lineage: string,
): string | null {
  return festivals?.find((f) => f.lineage_id === lineage)?.name ?? null
}

export function drawFestival(
  ctx: Ctx,
  f: FestivalInfo,
  cx: number,
  cy: number,
  tile: number,
  tick: number,
  t: number,
  color: string,
) {
  const glow = festivalGlow(f, tick)
  if (glow <= 0) return
  const u = Math.max(1.5, tile / 5)
  ctx.save()
  ctx.globalAlpha = Math.min(1, 0.25 + glow)

  // Bunting: pennants hung around a ring of poles.
  const r = tile * 5
  const poles = 10
  for (let i = 0; i < poles; i++) {
    const a = (i / poles) * Math.PI * 2
    const px = cx + Math.cos(a) * r
    const py = cy + Math.sin(a) * r * 0.7
    ctx.fillStyle = '#4a3322'
    ctx.fillRect(Math.round(px), Math.round(py - u * 6), u, u * 6)
    const b = ((i + 1) / poles) * Math.PI * 2
    const nx = cx + Math.cos(b) * r
    const ny = cy + Math.sin(b) * r * 0.7
    for (let k = 1; k < 4; k++) {
      const s = k / 4
      const fx = px + (nx - px) * s
      const fy = py + (ny - py) * s - u * 5 + Math.sin(s * Math.PI) * u * 2
      ctx.fillStyle = (i + k) % 2 ? color : '#f4d36a'
      ctx.fillRect(Math.round(fx), Math.round(fy), u * 1.6, u * 2)
    }
  }

  // The bonfire: logs, then flames that lick up and down.
  ctx.fillStyle = '#5b3f29'
  ctx.fillRect(Math.round(cx - u * 3), Math.round(cy), u * 6, u)
  ctx.fillRect(Math.round(cx - u * 2), Math.round(cy - u), u * 4, u)
  const lick = Math.floor(t / 90) % 2
  ctx.fillStyle = '#ff8c2d'
  ctx.fillRect(Math.round(cx - u * 2), Math.round(cy - u * (4 + lick)), u * 4, u * (3 + lick))
  ctx.fillStyle = '#ffd34d'
  ctx.fillRect(Math.round(cx - u), Math.round(cy - u * (5 + lick)), u * 2, u * (4 + lick))

  // Sparks drifting up from it.
  for (let i = 0; i < 6; i++) {
    const rise = ((t * 0.02 + i * 17) % 40) / 40
    const sx = cx + Math.sin(i * 2.3 + t * 0.001) * u * 4
    const sy = cy - u * 6 - rise * tile * 3
    ctx.globalAlpha = Math.min(1, 0.25 + glow) * (1 - rise)
    ctx.fillStyle = '#ffe9a3'
    ctx.fillRect(Math.round(sx), Math.round(sy), u, u)
  }
  ctx.restore()
}
