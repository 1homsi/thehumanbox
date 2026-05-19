import { create } from 'zustand'

const isWideViewport = typeof window !== 'undefined'
  && window.matchMedia('(min-width: 768px)').matches

export interface ViewFlags {
  territory:  boolean
  names:      boolean
  thoughts:   boolean
  animals:    boolean
  grid:       boolean
  trails:     boolean
  structures: boolean
  fertility:  boolean
  hazard:     boolean
  lineageDot: boolean
  health:     boolean
  age:        boolean
  fear:       boolean
  partners:   boolean
  pregnancy:  boolean
  history:    boolean
  fps:        boolean
  threeD:     boolean
  hideUI:     boolean
  photoMode:  boolean
  actionTicker: boolean
  randomTour: boolean
  slowMo:     boolean
  fastMo:     boolean
  colorBlind: boolean
  orgPov:     boolean
}

interface UIState {
  selectedOrgId: string | null
  followOrgId:   string | null

  showLanguages:   boolean
  showChronicles:  boolean
  showFamilyTree:  boolean
  showOrgSearch:   boolean
  showStats:       boolean
  showAllLineages: boolean
  showAbout:       boolean
  convoOrgId:      string | null

  panelOpen: boolean
  leftOpen:  boolean
  showMore:  boolean

  overlay:   string | null
  focus:     string
  viewFlags: ViewFlags

  isFullscreen: boolean

  selectOrg: (id: string | null) => void
  followOrg: (id: string | null) => void

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
  openConvo:        (id: string) => void
  closeConvo:       () => void
  closeAllModals:   () => void

  togglePanel:    () => void
  toggleLeft:     () => void
  toggleMore:     () => void
  setFullscreen:  (b: boolean) => void

  setOverlay:   (o: string | null) => void
  setFocus:     (f: string) => void
  setViewFlag:  (k: keyof ViewFlags, v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedOrgId: null,
  followOrgId:   null,

  showLanguages:   false,
  showChronicles:  false,
  showFamilyTree:  false,
  showOrgSearch:   false,
  showStats:       false,
  showAllLineages: false,
  showAbout:       false,
  convoOrgId:      null,

  panelOpen: false,
  leftOpen:  isWideViewport,
  showMore:  false,

  overlay:   null,
  focus:     'all',
  viewFlags: {
    territory: false, names: true, thoughts: false, animals: true, grid: false,
    trails: false, structures: false, fertility: false, hazard: false,
    lineageDot: false, health: false, age: false, fear: false,
    partners: false, pregnancy: false, history: false, fps: false,
    threeD: false, hideUI: false,
    photoMode: false, actionTicker: false,
    randomTour: false, slowMo: false, fastMo: false,
    colorBlind: false, orgPov: false,
  },

  isFullscreen: false,

  selectOrg: (id) => set(id == null ? { selectedOrgId: null, followOrgId: null } : { selectedOrgId: id }),
  followOrg: (id) => set({ followOrgId: id }),

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
    convoOrgId:      null,
  }),

  togglePanel:       () => set((s) => ({ panelOpen: !s.panelOpen })),
  toggleLeft:        () => set((s) => ({ leftOpen:  !s.leftOpen })),
  toggleMore:        () => set((s) => ({ showMore:  !s.showMore })),
  setFullscreen:     (b) => set({ isFullscreen: b }),

  setOverlay:    (o) => set({ overlay: o }),
  setFocus:      (f) => set({ focus: f }),
  setViewFlag:   (k, v) => set((s) => ({ viewFlags: { ...s.viewFlags, [k]: v } })),
}))
