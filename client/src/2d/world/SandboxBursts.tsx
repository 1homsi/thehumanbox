import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Short-lived pixel effects drawn over the world where a god tool lands, so
 * using a tool feels like something happened even before the simulation's
 * next frame shows the result. Effects are screen-space DOM, which keeps
 * them independent of the GPU or canvas renderer underneath.
 */
export type BurstKind = 'bolt' | 'heal' | 'spawn' | 'fire' | 'plague' | 'paint'

export interface Burst {
  id: number
  kind: BurstKind
  /** Screen position inside the world container, in CSS pixels. */
  x: number
  y: number
  /** Brush radius in CSS pixels at the current zoom. */
  r: number
  /** Jagged bolt path from the top of the view to the strike point. */
  path?: string
}

const LIFETIME_MS: Record<BurstKind, number> = {
  bolt: 650,
  heal: 900,
  spawn: 800,
  fire: 700,
  plague: 900,
  paint: 450,
}

/** Which effect a sandbox tool plays, keyed by tool id. */
export function burstForTool(toolId: string | null | undefined): BurstKind | null {
  switch (toolId) {
    case 'smite':
      return 'bolt'
    case 'heal':
      return 'heal'
    case 'spawn1':
    case 'spawn5':
    case 'deer':
    case 'rabbit':
    case 'boar':
    case 'wolf':
    case 'bird':
    case 'fish':
      return 'spawn'
    case 'fire':
      return 'fire'
    case 'grass':
    case 'water':
    case 'rock':
    case 'sand':
    case 'snow':
    case 'food':
    case 'drink':
    case 'shelter':
    case 'campfire':
      return 'paint'
    default:
      return null
  }
}

/** Zigzag from above the view down to (x, y), snapped to a 4px pixel grid. */
export function boltPath(x: number, y: number, rand: () => number = Math.random): string {
  const snap = (n: number) => Math.round(n / 4) * 4
  const steps = Math.max(4, Math.round(y / 36))
  const points: string[] = [`${snap(x + (rand() - 0.5) * 60)},-8`]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const drift = (rand() - 0.5) * 44 * (1 - t)
    points.push(`${snap(x + drift)},${snap(y * t)}`)
  }
  points.push(`${snap(x)},${snap(y)}`)
  return points.join(' ')
}

export function useSandboxBursts() {
  const [bursts, setBursts] = useState<Burst[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Set<number>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) window.clearTimeout(t)
      pending.clear()
    }
  }, [])

  const spawn = useCallback((kind: BurstKind, x: number, y: number, r: number) => {
    const id = nextId.current++
    const burst: Burst = { id, kind, x, y, r, path: kind === 'bolt' ? boltPath(x, y) : undefined }
    // Cap concurrent effects so rapid clicking never piles up DOM.
    setBursts((prev) => [...prev.slice(-11), burst])
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setBursts((prev) => prev.filter((b) => b.id !== id))
    }, LIFETIME_MS[kind])
    timers.current.add(timer)
  }, [])

  return { bursts, spawn }
}

export function SandboxBursts({ bursts, width, height }: { bursts: Burst[]; width: number; height: number }) {
  if (bursts.length === 0) return null
  return (
    <div className="sandbox-bursts" aria-hidden="true">
      {bursts.map((b) =>
        b.kind === 'bolt' ? (
          <div key={b.id}>
            <div className="burst-flash" />
            <svg className="burst-bolt" width={width} height={height} shapeRendering="crispEdges">
              <polyline points={b.path} className="burst-bolt-glow" />
              <polyline points={b.path} className="burst-bolt-core" />
            </svg>
            <div className="burst-impact" style={{ left: b.x, top: b.y }} />
          </div>
        ) : (
          <div
            key={b.id}
            className={`burst-ring burst-${b.kind}`}
            style={{ left: b.x, top: b.y, '--burst-r': `${Math.max(10, b.r)}px` } as CSSProperties}
          >
            {(b.kind === 'heal' || b.kind === 'plague') &&
              [0, 1, 2, 3, 4].map((i) => <span key={i} className="burst-spark" style={{ '--i': i } as CSSProperties} />)}
          </div>
        ),
      )}
    </div>
  )
}
