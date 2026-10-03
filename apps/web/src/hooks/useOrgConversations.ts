import { useQuery } from '@tanstack/react-query'
import type { ConversationEntry } from '../types'
import { API_BASE } from '../lib/config'
import { useSimulationData } from '../simulation/simulationData'

export interface OrgConversations {
  id: string
  name: string
  lineage_id: string
  vocabulary: Record<string, string>
  conversations: ConversationEntry[]
}

export function useOrgConversations(id: string | null) {
  const { apiEnabled, loadLocalOrgDetail } = useSimulationData()
  const { data, isLoading, isError } = useQuery<OrgConversations>({
    queryKey: ['orgConversations', apiEnabled ? 'api' : 'local', id],
    queryFn: async () => {
      if (!apiEnabled) {
        const detail = await loadLocalOrgDetail(id!)
        if (!detail) throw new Error(`local organism ${id} is unavailable`)
        return {
          id: detail.id,
          name: detail.name,
          lineage_id: detail.lineage_id,
          vocabulary: detail.vocabulary,
          conversations: detail.conversations,
        }
      }
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
