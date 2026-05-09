import { useQuery } from '@tanstack/react-query'
import type { OrgDetail } from './types'
import { API_BASE } from './config'

/**
 * Fetches full organism detail (conversations, vocabulary, thought_history,
 * life_log, daily_story) from GET /org/:id.
 *
 * Powered by TanStack Query so we get caching, deduplication, and
 * automatic revalidation across components for free. Multiple components
 * can call useOrgDetail(id) for the same id and share one network request.
 *
 * Polls every 3 seconds while the panel is open. Stops when id is null
 * (query disabled) or when the tab is hidden (refetchIntervalInBackground
 * default off).
 */
export function useOrgDetail(id: string | null): OrgDetail | null {
  const { data } = useQuery<OrgDetail>({
    queryKey:        ['orgDetail', id],
    queryFn:         async () => {
      const res = await fetch(`${API_BASE}/org/${id}`)
      if (!res.ok) throw new Error(`org ${id}: ${res.status}`)
      return res.json() as Promise<OrgDetail>
    },
    enabled:         id != null,
    refetchInterval: id != null ? 3000 : false,
    staleTime:       1500,                 // briefly de-dupes parallel mounts
    retry:           1,                    // sim might be restarting; one quick retry then hush
    refetchOnWindowFocus: false,
  })
  return data ?? null
}
