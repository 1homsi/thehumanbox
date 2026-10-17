import type { StateCreator } from 'zustand'
import type { UIState } from '../types'
import { trackEvent } from '../../../shared/observability'

export interface ModalsSlice {
  showLanguages: boolean
  showChronicles: boolean
  showFamilyTree: boolean
  showAchievements: boolean
  showGoals: boolean
  showScenarios: boolean
  /** The person the family tree opens on, or null for the whole population. */
  familyTreeFocus: string | null
  showOrgSearch: boolean
  showStats: boolean
  showAllLineages: boolean
  showAbout: boolean
  showCiv: boolean
  showNotable: boolean
  showDesktopSettings: boolean
  convoOrgId: string | null

  openLanguages: () => void
  closeLanguages: () => void
  openChronicles: () => void
  closeChronicles: () => void
  openFamilyTree: (focusId?: string | null) => void
  openAchievements: () => void
  closeAchievements: () => void
  openGoals: () => void
  closeGoals: () => void
  openScenarios: () => void
  closeScenarios: () => void
  closeFamilyTree: () => void
  openOrgSearch: () => void
  closeOrgSearch: () => void
  openStats: () => void
  closeStats: () => void
  openAllLineages: () => void
  closeAllLineages: () => void
  openAbout: () => void
  closeAbout: () => void
  openCiv: () => void
  closeCiv: () => void
  openNotable: () => void
  closeNotable: () => void
  openDesktopSettings: () => void
  closeDesktopSettings: () => void
  openConvo: (id: string) => void
  closeConvo: () => void
  closeAllModals: () => void
}

export const createModalsSlice: StateCreator<UIState, [], [], ModalsSlice> = (set) => ({
  showLanguages: false,
  showChronicles: false,
  showFamilyTree: false,
  familyTreeFocus: null,
  showAchievements: false,
  showGoals: false,
  showScenarios: false,
  showOrgSearch: false,
  showStats: false,
  showAllLineages: false,
  showAbout: false,
  showCiv: false,
  showNotable: false,
  showDesktopSettings: false,
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
  openFamilyTree: (focusId = null) => {
    trackEvent('modal_open', { modal: 'family_tree' })
    set({ showFamilyTree: true, familyTreeFocus: focusId })
  },
  closeFamilyTree: () => set({ showFamilyTree: false, familyTreeFocus: null }),
  openAchievements: () => {
    trackEvent('modal_open', { modal: 'achievements' })
    set({ showAchievements: true })
  },
  closeAchievements: () => set({ showAchievements: false }),
  openGoals: () => {
    trackEvent('modal_open', { modal: 'goals' })
    set({ showGoals: true })
  },
  closeGoals: () => set({ showGoals: false }),
  openScenarios: () => {
    trackEvent('modal_open', { modal: 'scenarios' })
    set({ showScenarios: true })
  },
  closeScenarios: () => set({ showScenarios: false }),
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
  openDesktopSettings: () => {
    trackEvent('modal_open', { modal: 'desktop_settings' })
    set({ showDesktopSettings: true })
  },
  closeDesktopSettings: () => set({ showDesktopSettings: false }),
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
      familyTreeFocus: null,
      showAchievements: false,
      showGoals: false,
      showScenarios: false,
      showOrgSearch: false,
      showStats: false,
      showAllLineages: false,
      showAbout: false,
      showCiv: false,
      showNotable: false,
      showDesktopSettings: false,
      convoOrgId: null,
    }),
})
