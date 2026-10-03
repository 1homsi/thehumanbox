import type { ReactNode } from 'react'
import { SimulationDataContext, type SimulationDataAccess } from './simulationData'

export function SimulationDataProvider({
  value,
  children,
}: {
  value: SimulationDataAccess
  children: ReactNode
}) {
  return <SimulationDataContext value={value}>{children}</SimulationDataContext>
}
