import { useEffect, useState } from 'react'
import type { WorldState } from '../types'
import { API_BASE } from '../lib/config'
import { useWorldStore } from '../stores/worldStore'
import { parseWorldFrame, fetchSnapshotWithProgress } from './wire'
import { mergeFrame, type MergeCaches } from './merge'

export interface WorldMeta {
  hash: string
  started_at_ms: number
  ended_at_ms: number
  final_tick: number
  final_population: number
  peak_population: number
  top_era: string
  lineage_count: number
  top_lineage?: string | null
  top_lineage_pop: number
}

interface HistoricalWorldState {
  loading: boolean
  error: string | null
  world: WorldState | null
  meta: WorldMeta | null
}

export function useHistoricalWorld(hash: string): HistoricalWorldState {
  const [state, setState] = useState<HistoricalWorldState>({
    loading: true,
    error: null,
    world: null,
    meta: null,
  })

  useEffect(() => {
    const ctl = new AbortController()
    let destroyed = false

    async function load() {
      try {
        const [snapBuf, metaRes] = await Promise.all([
          fetchSnapshotWithProgress(`${API_BASE}/worlds/${hash}/snapshot`, ctl.signal),
          fetch(`${API_BASE}/worlds/${hash}/meta`, { signal: ctl.signal }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.json() as Promise<WorldMeta>
          }),
        ])
        if (destroyed) return
        if (!snapBuf) throw new Error('snapshot was empty')

        const parsed = parseWorldFrame(snapBuf)
        if (parsed.isErr()) {
          const e = parsed.error
          throw new Error(e.kind === 'json' ? e.message : e.issues.join('; '))
        }
        const caches: MergeCaches = {
          organisms: new Map(),
          animals: new Map(),
          grid: null,
          prevWorld: null,
        }
        const { next } = mergeFrame(parsed.value, caches)
        useWorldStore.getState().setWorld(next)
        setState({ loading: false, error: null, world: next, meta: metaRes })
      } catch (err) {
        if (ctl.signal.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        setState({ loading: false, error: msg, world: null, meta: null })
      }
    }

    load()
    return () => {
      destroyed = true
      ctl.abort()
    }
  }, [hash])

  return state
}

export async function fetchWorldsList(signal?: AbortSignal): Promise<WorldMeta[]> {
  const r = await fetch(`${API_BASE}/worlds`, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = (await r.json()) as { worlds?: WorldMeta[] }
  return data.worlds ?? []
}
