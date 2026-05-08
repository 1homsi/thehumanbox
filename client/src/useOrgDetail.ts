import { useState, useEffect, useRef } from 'react'
import type { OrgDetail } from './types'
import { API_BASE } from './config'

/**
 * Fetches full organism detail (conversations, vocabulary, thought_history,
 * life_log, daily_story) from GET /org/:id.
 *
 * Only fetches while `id` is non-null, polling every 3 seconds so the panel
 * stays fresh without hammering the server.
 */
export function useOrgDetail(id: string | null): OrgDetail | null {
  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!id) {
      setDetail(null)
      return
    }

    const fetchDetail = async () => {
      try {
        const res = await fetch(`${API_BASE}/org/${id}`)
        if (res.ok) {
          const data = await res.json()
          setDetail(data)
        }
      } catch {
        // server may be restarting — ignore silently
      }
    }

    fetchDetail()
    intervalRef.current = setInterval(fetchDetail, 3000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [id])

  return detail
}
