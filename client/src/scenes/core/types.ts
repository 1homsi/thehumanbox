import type { ComponentType } from 'react'
import type { OrganismState, WorldState } from '../../types'

export type SceneId =
  | { kind: 'home'; orgId: string }
  | { kind: 'tavern'; lineageId: string }
  | { kind: 'temple'; religionId: string }
  | { kind: 'forge'; buildingId: number }
  | { kind: 'bakery'; buildingId: number }
  | { kind: 'mill'; buildingId: number }
  | { kind: 'settlement'; centerX: number; centerY: number; lineageId: string }
  | { kind: 'building'; buildingId: number }

export type SceneKind = SceneId['kind']

export type RenderMode = '2d' | '3d'

export type OccupantRole =
  | 'host'
  | 'partner'
  | 'child'
  | 'kin'
  | 'guest'
  | 'stranger'
  | 'patron'
  | 'worshipper'
  | 'brewer'
  | 'priest'

export interface SceneOccupant {
  org: OrganismState
  role: OccupantRole
  activity: string
}

export interface SceneFixture {
  id: string
  kind: string
  x: number
  y: number
  label?: string
}

export interface SceneContext {
  scene: SceneId
  world: WorldState
  title: string
  subtitle: string
  isDay: boolean
  occupants: SceneOccupant[]
  away: SceneOccupant[]
  fixtures: SceneFixture[]
}

export interface SceneRenderer {
  resolve: (world: WorldState, scene: SceneId) => SceneContext | null
  Render: ComponentType<{
    ctx: SceneContext
    onExit: () => void
    onFocusOrg: (id: string) => void
  }>
}

export type SceneRegistry = Partial<Record<SceneKind, Partial<Record<RenderMode, SceneRenderer>>>>
