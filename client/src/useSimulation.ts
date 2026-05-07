import { useEffect, useRef, useState } from 'react'
import type { WorldState } from './types'

const WS_URL = 'ws://localhost:8000/ws'

export function useSimulation() {
  const [world, setWorld] = useState<WorldState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        setTimeout(connect, 2000)
      }
      ws.onmessage = (e) => {
        setWorld(JSON.parse(e.data))
      }
    }

    connect()
    return () => wsRef.current?.close()
  }, [])

  return { world, connected }
}
