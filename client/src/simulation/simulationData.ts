import { createContext, useContext } from 'react'
import type { OrgDetail, OrgLife } from '../types'

export interface SimulationDataAccess {
  apiEnabled: boolean
  loadLocalOrgDetail: (id: string) => Promise<OrgDetail | null>
  loadLocalOrgLife: (id: string) => Promise<OrgLife | null>
}

const unavailable = async () => null

export const SimulationDataContext = createContext<SimulationDataAccess>({
  apiEnabled: true,
  loadLocalOrgDetail: unavailable,
  loadLocalOrgLife: unavailable,
})

export function useSimulationData(): SimulationDataAccess {
  return useContext(SimulationDataContext)
}
