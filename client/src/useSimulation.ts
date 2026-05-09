import { useEffect, useRef, useState } from 'react'
import { Result, ok, err } from 'neverthrow'
import type { WorldState, GridState, GridWire, OrganismState, AnimalState } from './types'
import { WS_BASE, API_BASE } from './config'
import { WorldEnvelopeSchema } from './schemas'

const WS_URL       = `${WS_BASE}/ws`
const SNAPSHOT_URL = `${API_BASE}/snapshot`

type ParseError =
  | { kind: 'json';     message: string }
  | { kind: 'schema';   issues: string[] }

/**
 * Parse + validate one WS frame. Returns a Result so the caller can decide
 * whether to log/skip/reconnect on bad data instead of swallowing it via
 * try/catch (the previous behaviour silently dropped corrupt frames).
 */
function parseWorldFrame(raw: string): Result<Omit<WorldState, 'grid'> & { grid: GridWire }, ParseError> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (e) {
    return err({ kind: 'json', message: e instanceof Error ? e.message : String(e) })
  }
  const parsed = WorldEnvelopeSchema.safeParse(json)
  if (!parsed.success) {
    return err({
      kind:   'schema',
      issues: parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`),
    })
  }
  // Schema only validates a subset of fields (organisms / animals / ticks);
  // the rest pass through via .passthrough(). Cast back to the WorldState
  // shape that downstream code expects.
  return ok(json as Omit<WorldState, 'grid'> & { grid: GridWire })
}

/** Rebuild dense fire_intensity and structure 2D arrays from sparse wire format. */
function applyGridWire(wire: GridWire, cache: GridState | null): GridState {
  const w = wire.width
  const h = wire.height

  // Dense fire - zero out, then apply sparse entries
  const fire: number[][] = Array.from({ length: h }, () => new Array(w).fill(0))
  for (const [row, col, v] of wire.fire) {
    if (row < h && col < w) fire[row][col] = v / 1000
  }

  // Dense structure - zero out, then apply sparse entries
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
  // RAF buffering - newest WS message wins; we only parse+setState once per
  // animation frame regardless of how fast the server sends.
  const latestMsg  = useRef<string | null>(null)
  const rafPending = useRef<number | null>(null)
  // Grid cache - holds the last fully-populated grid state so we can fill in
  // the static maps that aren't sent every tick.
  const gridCache  = useRef<GridState | null>(null)
  // Interpolation refs - the canvas reads these directly and runs a 60fps
  // RAF loop that lerps organism positions between `prev` and `current`.
  // This decouples render rate from message rate so a 1-second WS gap turns
  // into smooth slow-motion instead of a freeze + teleport.
  const prevWorldRef    = useRef<WorldState | null>(null)
  const currentWorldRef = useRef<WorldState | null>(null)
  const prevAtRef       = useRef<number>(0)
  const currentAtRef    = useRef<number>(0)

  // React-state throttle. The canvas reads currentWorldRef every RAF (60fps),
  // but the sidebar / cards / panels react to the `world` state - and at
  // TICK_MS=100 the WS pushes 10 messages/sec, which would have React
  // reconcile 200+ OrgCards ten times per second. Cap that to ~2 Hz so the
  // sim layer is uncoupled from React's render budget.
  const REACT_THROTTLE_MS  = 500
  const lastSetWorldAtRef  = useRef<number>(0)
  const pendingSetWorldRef = useRef<WorldState | null>(null)
  const setWorldTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function flushUpdate() {
      rafPending.current = null
      if (latestMsg.current) {
        const parseResult = parseWorldFrame(latestMsg.current)
        if (parseResult.isErr()) {
          const e = parseResult.error
          if (e.kind === 'json') console.warn('[ws] bad json:', e.message)
          else                    console.warn('[ws] schema mismatch:', e.issues)
          latestMsg.current = null
          return
        }
        try {
          const parsed = parseResult.value
          const grid   = applyGridWire(parsed.grid, gridCache.current)
          gridCache.current = grid

          // Merge that ignores null/undefined incoming values.
          //
          // The Rust backend serialises Option fields as JSON null when they're
          // None, even with skip_serializing_if attributes (serde_json::to_value
          // doesn't always honour those). A naive `{...existing, ...incoming}`
          // would overwrite our cached cold fields (lineage_id, traits, name…)
          // with null on every hot tick - the renderer would then crash trying
          // to read .curiosity off null traits.
          //
          // Only copy keys whose value is actually present, so cold fields
          // cached from the most recent full snapshot survive intact.
          function mergeDefined<T extends object>(target: T, src: Partial<T>): T {
            const out = { ...target } as Record<string, unknown>
            for (const k in src) {
              const v = (src as Record<string, unknown>)[k]
              if (v !== null && v !== undefined) out[k] = v
            }
            return out as T
          }

          // Full snapshot resets the cache; hot ticks merge defined fields
          // onto the existing entries so static fields stay populated between
          // full snapshots.
          if (parsed.organisms_complete) {
            organismCache.current = new Map(parsed.organisms.map(o => [o.id, o]))
          } else {
            for (const org of parsed.organisms) {
              const existing = organismCache.current.get(org.id)
              organismCache.current.set(org.id, existing ? mergeDefined(existing, org) : org)
            }
          }

          if (parsed.animals_complete) {
            animalCache.current = new Map(parsed.animals.map(a => [a.id, a]))
          } else {
            for (const animal of parsed.animals) {
              const existing = animalCache.current.get(animal.id)
              animalCache.current.set(animal.id, existing ? mergeDefined(existing, animal) : animal)
            }
          }

          const next: WorldState = {
            ...parsed,
            grid,
            organisms: [...organismCache.current.values()],
            viewport_organisms: parsed.organisms,
            animals: [...animalCache.current.values()],
            viewport_animals: parsed.animals,
          }

          // Roll the interpolation window forward. Renderer lerps organism
          // positions from `prev` to `current` over the elapsed real-time
          // gap, which absorbs network jitter into smooth motion.
          prevWorldRef.current    = currentWorldRef.current
          prevAtRef.current       = currentAtRef.current
          currentWorldRef.current = next
          currentAtRef.current    = performance.now()

          // Throttled setWorld for React-rendered UI.
          // Always store the latest world; either commit it now (if enough
          // time elapsed) or schedule a trailing-edge commit so the UI lands
          // on the freshest value rather than a stale one.
          pendingSetWorldRef.current = next
          const sinceLast = performance.now() - lastSetWorldAtRef.current
          if (sinceLast >= REACT_THROTTLE_MS) {
            lastSetWorldAtRef.current = performance.now()
            setWorld(next)
            if (setWorldTimerRef.current) {
              clearTimeout(setWorldTimerRef.current)
              setWorldTimerRef.current = null
            }
          } else if (setWorldTimerRef.current === null) {
            const delay = REACT_THROTTLE_MS - sinceLast
            setWorldTimerRef.current = setTimeout(() => {
              setWorldTimerRef.current = null
              const w = pendingSetWorldRef.current
              if (w) {
                lastSetWorldAtRef.current = performance.now()
                setWorld(w)
              }
            }, delay)
          }
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
        latestMsg.current = e.data          // always overwrite - skip stale messages
        if (rafPending.current === null) {
          rafPending.current = requestAnimationFrame(flushUpdate)
        }
      }
    }

    // Race the snapshot HTTP fetch against the WebSocket. /snapshot is
    // gzipped (~200 KB) and arrives in a couple of seconds even on slow
    // links, while the WS doesn't send anything until the next tick. The
    // first frame the client paints comes from whichever wins.
    //
    // If /snapshot 503s (server just started, cache empty), the WS will
    // catch up within ~3 s when the tick loop builds the cache.
    fetch(SNAPSHOT_URL, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) return null
        return r.text()
      })
      .then(text => {
        if (destroyed || text == null) return
        // Don't clobber a fresher message that already came over WS.
        if (latestMsg.current != null) return
        latestMsg.current = text
        if (rafPending.current === null) {
          rafPending.current = requestAnimationFrame(flushUpdate)
        }
      })
      .catch(() => { /* WS will deliver the world even if HTTP fails */ })

    connect()
    return () => {
      destroyed = true
      if (rafPending.current !== null) {
        cancelAnimationFrame(rafPending.current)
        rafPending.current = null
      }
      if (setWorldTimerRef.current !== null) {
        clearTimeout(setWorldTimerRef.current)
        setWorldTimerRef.current = null
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
