import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { trackEvent } from '../../../lib/analytics'

export interface ModalsSlice {
  showLanguages: boolean
  showChronicles: boolean
  showFamilyTree: boolean
  showOrgSearch: boolean
  showStats: boolean
  showAllLineages: boolean
  showAbout: boolean
  showCiv: boolean
  showWorlds: boolean
  showNotable: boolean
  convoOrgId: string | null

  openLanguages: () => void
  closeLanguages: () => void
  openChronicles: () => void
  closeChronicles: () => void
  openFamilyTree: () => void
  closeFamilyTree: () => void
  openOrgSearch: () => void
  closeOrgSearch: () => void
  openStats: () => void
  closeStats: () => void
  openAllLineages: () => void
  closeAllLineages: () => void
  openAbout: () => void
  closeAbout: () => void
  openWorlds: () => void
  closeWorlds: () => void
  openCiv: () => void
  closeCiv: () => void
  openNotable: () => void
  closeNotable: () => void
  openConvo: (id: string) => void
  closeConvo: () => void
  closeAllModals: () => void
}

export const createModalsSlice: StateCreator<UIState, [], [], ModalsSlice> = (set) => ({
  showLanguages: false,
  showChronicles: false,
  showFamilyTree: false,
  showOrgSearch: false,
  showStats: false,
  showAllLineages: false,
  showAbout: false,
  showCiv: false,
  showWorlds: false,
  showNotable: false,
  convoOrgId: null,

  openLanguages: () => {
    trackEvent('modal_open', { modal: 'languages' })
    set({ showLanguages: true })
  },
  closeLanguages: () => set({ showLanguages: false }),
  openChronicles: () => {
    trackEvent('modal_open', { modal: 'chronicles' })
    set({ showChronicles: true })
  },
  closeChronicles: () => set({ showChronicles: false }),
  openFamilyTree: () => {
    trackEvent('modal_open', { modal: 'family_tree' })
    set({ showFamilyTree: true })
  },
  closeFamilyTree: () => set({ showFamilyTree: false }),
  openOrgSearch: () => {
    trackEvent('modal_open', { modal: 'org_search' })
    set({ showOrgSearch: true })
  },
  closeOrgSearch: () => set({ showOrgSearch: false }),
  openStats: () => {
    trackEvent('modal_open', { modal: 'stats' })
    set({ showStats: true })
  },
  closeStats: () => set({ showStats: false }),
  openAllLineages: () => {
    trackEvent('modal_open', { modal: 'all_lineages' })
    set({ showAllLineages: true })
  },
  closeAllLineages: () => set({ showAllLineages: false }),
  openAbout: () => {
    trackEvent('modal_open', { modal: 'about' })
    set({ showAbout: true })
  },
  closeAbout: () => set({ showAbout: false }),
  openWorlds: () => {
    trackEvent('modal_open', { modal: 'worlds' })
    set({ showWorlds: true })
  },
  closeWorlds: () => set({ showWorlds: false }),
  openCiv: () => {
    trackEvent('modal_open', { modal: 'civ' })
    set({ showCiv: true })
  },
  closeCiv: () => set({ showCiv: false }),
  openNotable: () => {
    trackEvent('modal_open', { modal: 'notable' })
    set({ showNotable: true })
  },
  closeNotable: () => set({ showNotable: false }),
  openConvo: (id) => {
    trackEvent('modal_open', { modal: 'conversations', org_id: id })
    set({ convoOrgId: id })
  },
  closeConvo: () => set({ convoOrgId: null }),
  closeAllModals: () =>
    set({
      showLanguages: false,
      showChronicles: false,
      showFamilyTree: false,
      showOrgSearch: false,
      showStats: false,
      showAllLineages: false,
      showAbout: false,
      showCiv: false,
      showWorlds: false,
      showNotable: false,
      convoOrgId: null,
    }),
})
