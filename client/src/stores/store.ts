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
  colorBlind:   boolean
  orgPov:       boolean
  territoryMap: boolean
}

interface UIState {
  selectedOrgId: string | null
  followOrgId:   string | null
  starredOrgIds: string[]
  showStarredOnly: boolean

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

  panelOpen: boolean
  leftOpen:  boolean
  showMore:  boolean

  overlay:   string | null
  focus:     string
  viewFlags: ViewFlags

  isFullscreen: boolean

  nerdStats: boolean
  setNerdStats: (b: boolean) => void

  selectOrg: (id: string | null) => void
  followOrg: (id: string | null) => void
  toggleStar: (id: string) => void
  toggleShowStarredOnly: () => void

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

  togglePanel:    () => void
  toggleLeft:     () => void
  toggleMore:     () => void
  setFullscreen:  (b: boolean) => void

  setOverlay:   (o: string | null) => void
  setFocus:     (f: string) => void
  setViewFlag:  (k: keyof ViewFlags, v: boolean) => void
}

const NERD_KEY = 'thb-nerd-stats'
const loadNerd = (): boolean => {
  try { return window.localStorage.getItem(NERD_KEY) === '1' }
  catch { return false }
}
const saveNerd = (v: boolean): void => {
  try { window.localStorage.setItem(NERD_KEY, v ? '1' : '0') }
  catch { /* ignore */ }
}

const STARRED_KEY = 'thb-starred-orgs'
const loadStarred = (): string[] => {
  try {
    const raw = window.localStorage.getItem(STARRED_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
const saveStarred = (ids: string[]): void => {
  try { window.localStorage.setItem(STARRED_KEY, JSON.stringify(ids)) }
  catch { /* ignore */ }
}

export const useUIStore = create<UIState>((set) => ({
  selectedOrgId: null,
  followOrgId:   null,
  starredOrgIds: loadStarred(),
  showStarredOnly: false,

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
    colorBlind: false, orgPov: false, territoryMap: false,
  },

  isFullscreen: false,

  nerdStats: loadNerd(),
  setNerdStats: (b) => { saveNerd(b); set({ nerdStats: b }) },

  selectOrg: (id) => set(id == null ? { selectedOrgId: null, followOrgId: null } : { selectedOrgId: id }),
  followOrg: (id) => set({ followOrgId: id }),
  toggleStar: (id) => set((s) => {
    const has = s.starredOrgIds.includes(id)
    const next = has ? s.starredOrgIds.filter((x) => x !== id) : [...s.starredOrgIds, id]
    saveStarred(next)
    return { starredOrgIds: next }
  }),
  toggleShowStarredOnly: () => set((s) => ({ showStarredOnly: !s.showStarredOnly })),

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

  togglePanel:       () => set((s) => ({ panelOpen: !s.panelOpen })),
  toggleLeft:        () => set((s) => ({ leftOpen:  !s.leftOpen })),
  toggleMore:        () => set((s) => ({ showMore:  !s.showMore })),
  setFullscreen:     (b) => set({ isFullscreen: b }),

  setOverlay:    (o) => set({ overlay: o }),
  setFocus:      (f) => set({ focus: f }),
  setViewFlag:   (k, v) => set((s) => {
    if (s.viewFlags[k] === v) return s
    return { viewFlags: { ...s.viewFlags, [k]: v } }
  }),
}))

/**
 * Subscribe to a single ViewFlag. Use this instead of reading the
 * whole `viewFlags` object when a component only cares about one
 * key - toggling one flag won't re-render components that pulled
 * the whole object just for one boolean.
 */
export function useViewFlag<K extends keyof ViewFlags>(key: K): ViewFlags[K] {
  return useUIStore((s) => s.viewFlags[key])
}
