import type { FarmInfo } from '../types'

export type FarmStage = 'fallow' | 'seeded' | 'growing' | 'mature' | 'harvested'

const CROP_COLORS: Record<string, string> = {
  wheat: '#d7b85a',
  rice: '#82b86a',
  maize: '#d9a93d',
  barley: '#c6a85c',
  potato: '#789b54',
  beans: '#61975b',
  cotton: '#d8d3bb',
  tobacco: '#8b7946',
  sugarcane: '#77a851',
  coffee: '#567345',
  tea: '#4e8050',
}

export function farmStage(farm: FarmInfo, tick: number): FarmStage {
  if (farm.harvested) return 'fallow'
  if (farm.stage === 'fallow' || farm.stage === 'harvested') return 'fallow'
  if (typeof farm.ready_tick === 'number' && tick >= farm.ready_tick) return 'mature'
  if (farm.stage === 'mature') return farm.stage
  if (farm.stage === 'seeded' || farm.stage === 'growing') return farm.stage
  return farmProgress(farm, tick) < 0.12 ? 'seeded' : 'growing'
}

export function farmProgress(farm: FarmInfo, tick: number): number {
  if (farm.harvested) return 0
  if (typeof farm.planted_tick === 'number' && typeof farm.ready_tick === 'number') {
    if (farm.ready_tick <= farm.planted_tick) return tick >= farm.ready_tick ? 1 : 0
    return Math.max(0, Math.min(1, (tick - farm.planted_tick) / (farm.ready_tick - farm.planted_tick)))
  }
  if (typeof farm.progress === 'number') return Math.max(0, Math.min(1, farm.progress))
  return 0
}

export function farmCropColor(crop: string | undefined): string {
  return CROP_COLORS[crop?.toLowerCase() ?? ''] ?? '#8caa48'
}
