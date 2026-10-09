import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { trackEvent } from '../../../shared/observability'

export interface SelectionSlice {
  selectedOrgId: string | null
  followOrgId: string | null
  selectOrg: (id: string | null) => void
  followOrg: (id: string | null) => void
  /** The person whose name is being edited on their card, if any. */
  renamingOrgId: string | null
  startRename: (id: string) => void
  stopRename: () => void
}

export const createSelectionSlice: StateCreator<UIState, [], [], SelectionSlice> = (set, get) => ({
  selectedOrgId: null,
  followOrgId: null,
  renamingOrgId: null,
  startRename: (id) => set({ renamingOrgId: id, selectedOrgId: id, panelOpen: true }),
  stopRename: () => set({ renamingOrgId: null }),
  selectOrg: (id) => {
    const prev = get().selectedOrgId
    if (id != null && id !== prev) {
      trackEvent('org_select', { org_id: id })
    }
    set(
      id == null
        ? { selectedOrgId: null, followOrgId: null }
        : {
            selectedOrgId: id,
            followOrgId: get().followOrgId === id ? id : null,
            panelOpen: true,
          },
    )
  },
  followOrg: (id) => {
    if (id != null && id !== get().followOrgId) {
      trackEvent('org_follow', { org_id: id })
    }
    set({ followOrgId: id })
  },
})
