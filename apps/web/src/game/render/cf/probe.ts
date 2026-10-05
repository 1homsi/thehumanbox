import { cfFlag } from './flags'

/**
 * Timing samples for measuring the cf pieces in a real browser (`?cf=camera,probe`).
 * Read them from the console: `__cfProbe.summary()`. Does nothing without the flag.
 */
interface Series {
  n: number
  total: number
  max: number
  samples: number[]
}

interface Probe {
  series: Record<string, Series>
  summary: () => Record<string, { n: number; meanMs: number; p95Ms: number; maxMs: number }>
  reset: () => void
  camera?: () => { x: number; y: number; zoom: number }
}

let probe: Probe | null | undefined

function install(): Probe | null {
  if (probe !== undefined) return probe
  if (!cfFlag('probe')) return (probe = null)
  const p: Probe = {
    series: {},
    reset: () => {
      p.series = {}
    },
    summary: () =>
      Object.fromEntries(
        Object.entries(p.series).map(([name, s]) => {
          const sorted = [...s.samples].sort((a, b) => a - b)
          return [
            name,
            {
              n: s.n,
              meanMs: s.total / s.n,
              p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
              maxMs: s.max,
            },
          ]
        }),
      ),
  }
  ;(window as unknown as { __cfProbe: Probe }).__cfProbe = p
  return (probe = p)
}

/** Record how long something took. */
export function cfSample(name: string, ms: number): void {
  const p = install()
  if (!p) return
  const s = (p.series[name] ??= { n: 0, total: 0, max: 0, samples: [] })
  s.n++
  s.total += ms
  if (ms > s.max) s.max = ms
  if (s.samples.length < 5000) s.samples.push(ms)
}

/** Let the console read the live camera. */
export function cfExposeCamera(read: () => { x: number; y: number; zoom: number }): void {
  const p = install()
  if (p) p.camera = read
}
