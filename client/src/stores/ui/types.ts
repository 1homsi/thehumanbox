export interface ViewFlags {
  territory: boolean
  names: boolean
  thoughts: boolean
  animals: boolean
  grid: boolean
  trails: boolean
  structures: boolean
  fertility: boolean
  hazard: boolean
  lineageDot: boolean
  health: boolean
  age: boolean
  fear: boolean
  partners: boolean
  pregnancy: boolean
  history: boolean
  fps: boolean
  threeD: boolean
  hideUI: boolean
  photoMode: boolean
  actionTicker: boolean
  randomTour: boolean
  slowMo: boolean
  fastMo: boolean
  colorBlind: boolean
  orgPov: boolean
  territoryMap: boolean
  headlineTicker: boolean
}

import type {
  SelectionSlice,
  StarredSlice,
  ModalsSlice,
  PanelsSlice,
  OverlaySlice,
  ViewFlagsSlice,
  NerdStatsSlice,
  FullscreenSlice,
  InteriorSlice,
} from './slices'

export type UIState = SelectionSlice &
  StarredSlice &
  ModalsSlice &
  PanelsSlice &
  OverlaySlice &
  ViewFlagsSlice &
  NerdStatsSlice &
  FullscreenSlice &
  InteriorSlice
