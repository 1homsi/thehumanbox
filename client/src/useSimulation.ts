import { useEffect, useRef, useState } from 'react'
import type { WorldState } from './types'

const WS_URL = 'ws://localhost:8000/ws'

export function useSimulation() {
  const [world, setWorld]     = useState<WorldState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef      = useRef<WebSocket | null>(null)
  // RAF buffering — newest WS message wins; we only parse+setState once per
  // animation frame regardless of how fast the server sends.
  const latestMsg  = useRef<string | null>(null)
  const rafPending = useRef<number | null>(null)

  useEffect(() => {
    function flushUpdate() {
      rafPending.current = null
      if (latestMsg.current) {
        try { setWorld(JSON.parse(latestMsg.current)) } catch (_) {}
        latestMsg.current = null
      }
    }

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (rafPending.current !== null) {
          cancelAnimationFrame(rafPending.current)
          rafPending.current = null
        }
        setTimeout(connect, 2000)
      }
      ws.onmessage = (e) => {
        latestMsg.current = e.data          // always overwrite — skip stale messages
        if (rafPending.current === null) {
          rafPending.current = requestAnimationFrame(flushUpdate)
        }
      }
    }

    connect()
    return () => {
      if (rafPending.current !== null) {
        cancelAnimationFrame(rafPending.current)
        rafPending.current = null
      }
      wsRef.current?.close()
    }
  }, [])

  return { world, connected }
}
