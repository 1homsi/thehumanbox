import type { StateCreator } from 'zustand'
import type { UIState } from '../types'

export interface ModalsSlice {
  showLanguages:   boolean
  showChronicles:  boolean
  showFamilyTree:  boolean
  showOrgSearch:   boolean
  showStats:       boolean
  showAllLineages: boolean
  showAbout:       boolean
  showCiv:         boolean
  showWorlds:      boolean
  convoOrgId:      string | null

  openLanguages:    () => void
  closeLanguages:   () => void
  openChronicles:   () => void
  closeChronicles:  () => void
  openFamilyTree:   () => void
  closeFamilyTree:  () => void
  openOrgSearch:    () => void
  closeOrgSearch:   () => void
  openStats:        () => void
  closeStats:       () => void
  openAllLineages:  () => void
  closeAllLineages: () => void
  openAbout:        () => void
  closeAbout:       () => void
  openWorlds:       () => void
  closeWorlds:      () => void
  openCiv:          () => void
  closeCiv:         () => void
  openConvo:        (id: string) => void
  closeConvo:       () => void
  closeAllModals:   () => void
}

export const createModalsSlice: StateCreator<UIState, [], [], ModalsSlice> = (set) => ({
  showLanguages:   false,
  showChronicles:  false,
  showFamilyTree:  false,
  showOrgSearch:   false,
  showStats:       false,
  showAllLineages: false,
  showAbout:       false,
  showCiv:         false,
  showWorlds:      false,
  convoOrgId:      null,

  openLanguages:    () => set({ showLanguages:   true }),
  closeLanguages:   () => set({ showLanguages:   false }),
  openChronicles:   () => set({ showChronicles:  true }),
  closeChronicles:  () => set({ showChronicles:  false }),
  openFamilyTree:   () => set({ showFamilyTree:  true }),
  closeFamilyTree:  () => set({ showFamilyTree:  false }),
  openOrgSearch:    () => set({ showOrgSearch:   true }),
  closeOrgSearch:   () => set({ showOrgSearch:   false }),
  openStats:        () => set({ showStats:       true }),
  closeStats:       () => set({ showStats:       false }),
  openAllLineages:  () => set({ showAllLineages: true }),
  closeAllLineages: () => set({ showAllLineages: false }),
  openAbout:        () => set({ showAbout:       true }),
  closeAbout:       () => set({ showAbout:       false }),
  openWorlds:       () => set({ showWorlds:      true }),
  closeWorlds:      () => set({ showWorlds:      false }),
  openCiv:          () => set({ showCiv:         true }),
  closeCiv:         () => set({ showCiv:         false }),
  openConvo:        (id) => set({ convoOrgId: id }),
  closeConvo:       () => set({ convoOrgId: null }),
  closeAllModals:   () => set({
    showLanguages:   false,
    showChronicles:  false,
    showFamilyTree:  false,
    showOrgSearch:   false,
    showStats:       false,
    showAllLineages: false,
    showAbout:       false,
    showCiv:         false,
    showWorlds:      false,
    convoOrgId:      null,
  }),
})
