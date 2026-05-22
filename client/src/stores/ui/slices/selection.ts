import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

export interface SelectionSlice {
  selectedOrgId: string | null
  followOrgId:   string | null
  selectOrg: (id: string | null) => void
  followOrg: (id: string | null) => void
}

export const createSelectionSlice: StateCreator<UIState, [], [], SelectionSlice> = (set) => ({
  selectedOrgId: null,
  followOrgId:   null,
  selectOrg: (id) => set(id == null
    ? { selectedOrgId: null, followOrgId: null }
    : { selectedOrgId: id }),
  followOrg: (id) => set({ followOrgId: id }),
})
