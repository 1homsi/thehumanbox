import { useEffect, useRef, useState } from 'react'
import type { WorldState, GridState, GridWire, OrganismState, AnimalState } from './types'
import { WS_BASE } from './config'

const WS_URL = `${WS_BASE}/ws`

/** Rebuild dense fire_intensity and structure 2D arrays from sparse wire format. */
function applyGridWire(wire: GridWire, cache: GridState | null): GridState {
  const w = wire.width
  const h = wire.height

  // Dense fire — zero out, then apply sparse entries
  const fire: number[][] = Array.from({ length: h }, () => new Array(w).fill(0))
  for (const [row, col, v] of wire.fire) {
    if (row < h && col < w) fire[row][col] = v / 1000
  }

  // Dense structure — zero out, then apply sparse entries
  const structure: number[][] = Array.from({ length: h }, () => new Array(w).fill(0))
  for (const [row, col, v] of wire.structure) {
    if (row < h && col < w) structure[row][col] = v / 100
  }

  return {
    width:    wire.width,
    height:   wire.height,
    origin_x: wire.origin_x,
    origin_y: wire.origin_y,
    // Static maps: use incoming when present, fall back to cache
    tiles:     wire.tiles     ?? cache?.tiles     ?? [],
    biomes:    wire.biomes    ?? cache?.biomes,
    depth_map: wire.depth_map ?? cache?.depth_map,
    // Dynamic: always rebuilt from wire
    fire_intensity: fire,
    structure,
  }
}

export interface InterpRefs {
  prev:    React.MutableRefObject<WorldState | null>
  current: React.MutableRefObject<WorldState | null>
  prevAt:    React.MutableRefObject<number>
  currentAt: React.MutableRefObject<number>
}

export function useSimulation(): { world: WorldState | null; connected: boolean; interp: InterpRefs } {
  const [world, setWorld]     = useState<WorldState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef      = useRef<WebSocket | null>(null)
  const organismCache = useRef<Map<string, OrganismState>>(new Map())
  const animalCache   = useRef<Map<number, AnimalState>>(new Map())
  // RAF buffering — newest WS message wins; we only parse+setState once per
  // animation frame regardless of how fast the server sends.
  const latestMsg  = useRef<string | null>(null)
  const rafPending = useRef<number | null>(null)
  // Grid cache — holds the last fully-populated grid state so we can fill in
  // the static maps that aren't sent every tick.
  const gridCache  = useRef<GridState | null>(null)
  // Interpolation refs — the canvas reads these directly and runs a 60fps
  // RAF loop that lerps organism positions between `prev` and `current`.
  // This decouples render rate from message rate so a 1-second WS gap turns
  // into smooth slow-motion instead of a freeze + teleport.
  const prevWorldRef    = useRef<WorldState | null>(null)
  const currentWorldRef = useRef<WorldState | null>(null)
  const prevAtRef       = useRef<number>(0)
  const currentAtRef    = useRef<number>(0)

  useEffect(() => {
    function flushUpdate() {
      rafPending.current = null
      if (latestMsg.current) {
        try {
          const parsed = JSON.parse(latestMsg.current) as Omit<WorldState, 'grid'> & { grid: GridWire }
          const grid   = applyGridWire(parsed.grid, gridCache.current)
          gridCache.current = grid

          // Full snapshot resets the cache; hot ticks merge new fields onto the
          // existing entries so cold fields (name, traits, vocabulary, lineage_id…)
          // sent only with full snapshots stay populated between them.
          if (parsed.organisms_complete) {
            organismCache.current = new Map(parsed.organisms.map(o => [o.id, o]))
          } else {
            for (const org of parsed.organisms) {
              const existing = organismCache.current.get(org.id)
              organismCache.current.set(org.id, existing ? { ...existing, ...org } : org)
            }
          }

          if (parsed.animals_complete) {
            animalCache.current = new Map(parsed.animals.map(a => [a.id, a]))
          } else {
            for (const animal of parsed.animals) {
              const existing = animalCache.current.get(animal.id)
              animalCache.current.set(animal.id, existing ? { ...existing, ...animal } : animal)
            }
          }

          const next: WorldState = {
            ...parsed,
            grid,
            organisms: [...organismCache.current.values()],
            animals: [...animalCache.current.values()],
          }

          // Roll the interpolation window forward. Renderer lerps organism
          // positions from `prev` to `current` over the elapsed real-time
          // gap, which absorbs network jitter into smooth motion.
          prevWorldRef.current    = currentWorldRef.current
          prevAtRef.current       = currentAtRef.current
          currentWorldRef.current = next
          currentAtRef.current    = performance.now()

          setWorld(next)
        } catch (_) {}
        latestMsg.current = null
      }
    }

    let destroyed = false

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => { if (!destroyed) setConnected(true) }
      ws.onclose = () => {
        if (destroyed) return
        setConnected(false)
        if (rafPending.current !== null) {
          cancelAnimationFrame(rafPending.current)
          rafPending.current = null
        }
        setTimeout(connect, 2000)
      }
      ws.onmessage = (e) => {
        if (destroyed) return
        latestMsg.current = e.data          // always overwrite — skip stale messages
        if (rafPending.current === null) {
          rafPending.current = requestAnimationFrame(flushUpdate)
        }
      }
    }

    connect()
    return () => {
      destroyed = true
      if (rafPending.current !== null) {
        cancelAnimationFrame(rafPending.current)
        rafPending.current = null
      }
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null   // prevent reconnect loop on intentional teardown
        ws.onmessage = null
        ws.close()
        wsRef.current = null
      }
    }
  }, [])

  return {
    world,
    connected,
    interp: {
      prev:      prevWorldRef,
      current:   currentWorldRef,
      prevAt:    prevAtRef,
      currentAt: currentAtRef,
    },
  }
}
