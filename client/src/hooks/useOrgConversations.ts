import { useQuery } from '@tanstack/react-query'
import type { ConversationEntry } from '../types'
import { API_BASE } from '../lib/config'

export interface OrgConversations {
  id: string
  name: string
  lineage_id: string
  vocabulary: Record<string, string>
  conversations: ConversationEntry[]
}

export function useOrgConversations(id: string | null) {
  const { data, isLoading, isError } = useQuery<OrgConversations>({
    queryKey: ['orgConversations', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/org/${id}/conversations`)
      if (!res.ok) throw new Error(`org ${id} convos: ${res.status}`)
      return res.json() as Promise<OrgConversations>
    },
    enabled: id != null,
    refetchInterval: id != null ? 5000 : false,
    staleTime: 2000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
  return { data: data ?? null, isLoading: id != null && isLoading, isError }
}
