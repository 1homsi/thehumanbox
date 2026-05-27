import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { trackEvent } from '../../../lib/observability'

export interface SelectionSlice {
  selectedOrgId: string | null
  followOrgId: string | null
  selectOrg: (id: string | null) => void
  followOrg: (id: string | null) => void
}

export const createSelectionSlice: StateCreator<UIState, [], [], SelectionSlice> = (set, get) => ({
  selectedOrgId: null,
  followOrgId: null,
  selectOrg: (id) => {
    const prev = get().selectedOrgId
    if (id != null && id !== prev) {
      trackEvent('org_select', { org_id: id })
    }
    set(id == null ? { selectedOrgId: null, followOrgId: null } : { selectedOrgId: id })
  },
  followOrg: (id) => {
    if (id != null && id !== get().followOrgId) {
      trackEvent('org_follow', { org_id: id })
    }
    set({ followOrgId: id })
  },
})
