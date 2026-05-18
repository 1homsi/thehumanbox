import { create } from 'zustand'

/**
 * Global UI state.
 *
 * Anything that's "what's the user looking at right now" lives here so
 * components can subscribe to specific slices without prop-drilling and
 * without re-rendering when an unrelated slice changes.
 *
 * What does NOT live here:
 *  - Live simulation data (organisms, world state) - those flow via the
 *    useSimulation hook, kept out of zustand so the throttled React
 *    state machinery there stays simple.
 *  - Server-fetched data (organism details, etc.) - handled by
 *    TanStack Query.
 */

export interface ViewFlags {
  territory:  boolean
  names:      boolean
  thoughts:   boolean
  animals:    boolean
  grid:       boolean
  // New overlays added 2026-05-11 to surface state that was already in
  // the world but had no UI affordance.
  trails:     boolean   // food / water / path stigmergy
  structures: boolean   // huts + campfires highlighted
  fertility:  boolean   // green-tint overlay for fertile soil
  hazard:     boolean   // hazard scars
  lineageDot: boolean   // colored dot per organism (tribe affiliation)
  health:     boolean   // ring tint by health / hunger
  age:        boolean   // age tint (child / adult / elder)
  fear:       boolean   // fear halo
  partners:   boolean   // bond line between partners
  pregnancy:  boolean   // pregnancy marker
  history:    boolean   // per-lineage centroid drift trails (historical geography)
  fps:        boolean   // perf overlay
  threeD:     boolean   // 3D world (experimental) - free-fly WASD + mouse
  hideUI:     boolean   // hide sidebars in 3D for immersion
  // ── Experiments (display modes) ───────────────────────────────────────
  photoMode:  boolean   // hide ALL UI for screenshots (header + every panel)
  actionTicker: boolean // bottom strip scrolling live actions
  miniMap2D:  boolean   // top-right top-down overview in 2D mode
  randomTour: boolean   // auto-cycle camera/selection every 8s
  slowMo:     boolean   // 0.5× WS frame lerp (cinematic)
  fastMo:     boolean   // 2× WS frame lerp
  colorBlind: boolean   // deuteranopia-safe lineage palette
  orgPov:     boolean   // 3D: first-person camera from selected org
}

interface UIState {
  // Selection & camera
  selectedOrgId: string | null
  followOrgId:   string | null

  // Modals - one open at a time is the common case but we keep flags
  // separate so a future "modal stack" doesn't need a refactor.
  showLanguages:   boolean
  showChronicles:  boolean
  showFamilyTree:  boolean
  showOrgSearch:   boolean
  showStats:       boolean
  showAllLineages: boolean
  showAbout:       boolean
  convoOrgId:      string | null

  // Layout panels
  panelOpen: boolean
  leftOpen:  boolean
  showMore:  boolean

  // Map view
  overlay:   string | null
  focus:     string
  viewFlags: ViewFlags

  // Misc
  isFullscreen: boolean

  // Actions
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
  leftOpen:  true,
  showMore:  false,

  overlay:   null,
  focus:     'all',
  viewFlags: {
    territory: false, names: true, thoughts: false, animals: true, grid: false,
    trails: false, structures: false, fertility: false, hazard: false,
    lineageDot: false, health: false, age: false, fear: false,
    partners: false, pregnancy: false, history: false, fps: false,
    threeD: false, hideUI: false,
    photoMode: false, actionTicker: false, miniMap2D: false,
    randomTour: false, slowMo: false, fastMo: false,
    colorBlind: false, orgPov: false,
  },

  isFullscreen: false,

  // Selecting an org with id=null also clears the follow target - picking
  // someone else and then unselecting shouldn't leave the camera locked
  // on the previous follow.
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
