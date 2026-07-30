import type { StateCreator } from 'zustand'
import type { UIState, ViewFlags } from '../types'
import { trackEvent } from '../../../lib/observability'

export interface ViewFlagsSlice {
  viewFlags: ViewFlags
  setViewFlag: (k: keyof ViewFlags, v: boolean) => void
  setTerritoryView: (enabled: boolean) => void
}

const DEFAULTS: ViewFlags = {
  territory: false,
  names: true,
  thoughts: false,
  animals: true,
  grid: false,
  trails: false,
  structures: false,
  fertility: false,
  hazard: false,
  lineageDot: false,
  health: false,
  age: false,
  fear: false,
  partners: false,
  pregnancy: false,
  history: false,
  fps: false,
  threeD: false,
  hideUI: false,
  photoMode: false,
  randomTour: false,
  slowMo: false,
  fastMo: false,
  colorBlind: false,
  orgPov: false,
  territoryMap: false,
  headlineTicker: false,
}

const TRACKED_FLAGS: Set<keyof ViewFlags> = new Set(['threeD', 'orgPov', 'photoMode', 'randomTour', 'hideUI'])
const MAP_FLAGS = ['territory', 'history'] as const
const MAP_FLAGS_STORAGE_KEY = 'thb-map-view-flags'

function readSavedMapFlags(): Partial<ViewFlags> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MAP_FLAGS_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >
    const flags = Object.fromEntries(
      MAP_FLAGS.filter((key) => typeof parsed[key] === 'boolean').map((key) => [key, parsed[key]]),
    ) as Partial<ViewFlags>
    // Migrate the old renderer-specific 3D toggle into the one shared
    // territory preference, then keep the legacy flag dormant.
    if (parsed.territoryMap === true) flags.territory = true
    flags.territoryMap = false
    return flags
  } catch {
    return {}
  }
}

function saveMapFlags(flags: ViewFlags): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      MAP_FLAGS_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(MAP_FLAGS.map((key) => [key, flags[key]]))),
    )
  } catch {
    // Map controls remain usable when browser storage is unavailable.
  }
}

function initialViewFlags(): ViewFlags {
  if (typeof window === 'undefined') return DEFAULTS
  const initial = { ...DEFAULTS, ...readSavedMapFlags() }
  const params = new URLSearchParams(window.location.search)
  if (params.get('3d') === '1' || params.has('view3d')) {
    return { ...initial, threeD: true }
  }
  return initial
}

export const createViewFlagsSlice: StateCreator<UIState, [], [], ViewFlagsSlice> = (set) => ({
  viewFlags: initialViewFlags(),
  setTerritoryView: (enabled) =>
    set((s) => {
      const viewFlags = { ...s.viewFlags, territory: enabled, territoryMap: false }
      saveMapFlags(viewFlags)
      return {
        viewFlags,
        selectedOrgId: enabled ? null : s.selectedOrgId,
        followOrgId: enabled ? null : s.followOrgId,
        panelOpen: enabled ? false : s.panelOpen,
        leftOpen: enabled ? false : s.leftOpen,
        focus: !enabled && s.focus.startsWith('lineage:') ? 'all' : s.focus,
      }
    }),
  setViewFlag: (k, v) =>
    set((s) => {
      if (s.viewFlags[k] === v) return s
      if (TRACKED_FLAGS.has(k)) {
        trackEvent('view_flag_toggle', { flag: k as string, value: v })
      }
      const viewFlags = { ...s.viewFlags, [k]: v }
      if (MAP_FLAGS.includes(k as (typeof MAP_FLAGS)[number])) saveMapFlags(viewFlags)
      return { viewFlags }
    }),
})
