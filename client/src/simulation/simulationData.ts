import { createContext, useContext } from 'react'
import type { OrgDetail, OrgLife } from '../types'
import type { PlayerWorldKind } from './worldSource'

export interface SimulationDataAccess {
  apiEnabled: boolean
  playerWorldKind: PlayerWorldKind
  loadLocalOrgDetail: (id: string) => Promise<OrgDetail | null>
  loadLocalOrgLife: (id: string) => Promise<OrgLife | null>
}

const unavailable = async () => null

export const SimulationDataContext = createContext<SimulationDataAccess>({
  apiEnabled: false,
  playerWorldKind: 'local',
  loadLocalOrgDetail: unavailable,
  loadLocalOrgLife: unavailable,
})

export function useSimulationData(): SimulationDataAccess {
  return useContext(SimulationDataContext)
}
