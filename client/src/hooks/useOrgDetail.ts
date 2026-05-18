import { useQuery } from '@tanstack/react-query'
import type { OrgDetail } from '../types'
import { API_BASE } from '../lib/config'

export interface UseOrgDetailResult {
  data:      OrgDetail | null
  isLoading: boolean
  isError:   boolean
}

export function useOrgDetail(id: string | null): UseOrgDetailResult {
  const { data, isLoading, isError } = useQuery<OrgDetail>({
    queryKey:        ['orgDetail', id],
    queryFn:         async () => {
      const res = await fetch(`${API_BASE}/org/${id}`)
      if (!res.ok) throw new Error(`org ${id}: ${res.status}`)
      return res.json() as Promise<OrgDetail>
    },
    enabled:         id != null,
    refetchInterval: id != null ? 3000 : false,
    staleTime:       1500,
    retry:           1,
    refetchOnWindowFocus: false,
  })
  return { data: data ?? null, isLoading: id != null && isLoading, isError }
}
