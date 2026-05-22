import type { ComponentType } from 'react'
import type { OrganismState, WorldState } from '../../types'

export type SceneId =
  | { kind: 'home',     orgId: string }
  | { kind: 'building', buildingId: number }

export type SceneKind = SceneId['kind']

export type OccupantRole = 'host' | 'partner' | 'child' | 'kin' | 'guest' | 'stranger'

export interface SceneOccupant {
  org:      OrganismState
  role:     OccupantRole
  activity: string
}

export interface SceneFixture {
  id:    string
  kind:  string
  x:     number
  y:     number
  label?: string
}

export interface SceneContext {
  scene:     SceneId
  world:     WorldState
  title:     string
  subtitle:  string
  isDay:     boolean
  occupants: SceneOccupant[]
  fixtures:  SceneFixture[]
}

export interface SceneRenderer {
  resolve: (world: WorldState, scene: SceneId) => SceneContext | null
  Render:  ComponentType<{ ctx: SceneContext; onExit: () => void; onFocusOrg: (id: string) => void }>
}

export type SceneRegistry = Partial<Record<SceneKind, SceneRenderer>>
