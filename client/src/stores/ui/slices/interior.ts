import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

export interface InteriorSlice {
  interiorOrgId: string | null
  enterInterior: (id: string) => void
  exitInterior:  () => void
}

export const createInteriorSlice: StateCreator<UIState, [], [], InteriorSlice> = (set) => ({
  interiorOrgId: null,
  enterInterior: (id) => set({ interiorOrgId: id, selectedOrgId: id }),
  exitInterior:  () => set({ interiorOrgId: null }),
})
