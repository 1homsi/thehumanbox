import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Group } from 'three'
import type { OrganismState, SettlementInfo } from '../../../types'
import { activeStrategy, strategyTimeLabel, type StrategyEntry } from '../../../world/strategy-visuals'
import { FaceCamera } from './FaceCamera'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  settlements: SettlementInfo[]
  strategies?: Record<string, StrategyEntry>
  lineageHomes?: Record<string, [number, number, number]>
  organisms: OrganismState[]
  tick: number
  depthMap: number[][]
  biomes: number[][]
}

interface Marker {
  key: string
  x: number
  y: number
  symbol: string
  label: string
  color: string
  remaining: string
  phase: number
}

const MAX_MARKERS = 24

function markerPhase(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2
}

function StrategyMarker({
  marker,
  depthMap,
  biomes,
}: {
  marker: Marker
  depthMap: number[][]
  biomes: number[][]
}) {
  const pulseRef = useRef<Group>(null)
  const groundY = heightAt(marker.x, marker.y, depthMap, biomes)

  useFrame(({ clock }) => {
    if (!pulseRef.current) return
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 2.2 + marker.phase) * 0.09
    pulseRef.current.scale.setScalar(pulse)
    pulseRef.current.rotation.y += 0.002
  })

  return (
    <group position={[marker.x * TILE_SCALE, groundY + 0.24, marker.y * TILE_SCALE]}>
      <group ref={pulseRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={989}>
          <ringGeometry args={[3.2, 3.62, 32]} />
          <meshBasicMaterial
            color={marker.color}
            transparent
            opacity={0.58}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={988}>
          <ringGeometry args={[4.45, 4.56, 32]} />
          <meshBasicMaterial
            color={marker.color}
            transparent
            opacity={0.24}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
      <FaceCamera position={[0, 9.5, 0]}>
        <Text
          fontSize={1.35}
          color={marker.color}
          outlineWidth={0.08}
          outlineColor="#080b0e"
          outlineOpacity={0.95}
          anchorX="center"
          anchorY="middle"
          renderOrder={996}
          material-toneMapped={false}
          material-depthWrite={false}
        >
          {`${marker.symbol} ${marker.label}`}
        </Text>
        <Text
          fontSize={0.62}
          color="#dce7ec"
          outlineWidth={0.045}
          outlineColor="#080b0e"
          outlineOpacity={0.9}
          position={[0, -1.15, 0]}
          anchorX="center"
          anchorY="middle"
          renderOrder={996}
          material-toneMapped={false}
          material-depthWrite={false}
        >
          {marker.remaining}
        </Text>
      </FaceCamera>
    </group>
  )
}

export function StrategyMarkers3D({
  settlements,
  strategies,
  lineageHomes,
  organisms,
  tick,
  depthMap,
  biomes,
}: Props) {
  const markers = useMemo<Marker[]>(() => {
    if (!strategies) return []
    const settlementByLineage = new Map(settlements.map((settlement) => [settlement.lineage_id, settlement]))
    return Object.entries(strategies)
      .map(([lineageId, entry]) => {
        const visual = activeStrategy(entry, tick)
        if (!visual) return null
        const settlement = settlementByLineage.get(lineageId)
        const home = lineageHomes?.[lineageId]
        const members = organisms.filter((organism) => organism.alive && organism.lineage_id === lineageId)
        if (!settlement && !home && members.length === 0) return null
        const x =
          settlement?.center[0] ??
          home?.[0] ??
          members.reduce((sum, organism) => sum + organism.x, 0) / members.length
        const y =
          settlement?.center[1] ??
          home?.[1] ??
          members.reduce((sum, organism) => sum + organism.y, 0) / members.length
        return {
          key: lineageId,
          x,
          y,
          symbol: visual.symbol,
          label: visual.label,
          color: visual.color,
          remaining: strategyTimeLabel(visual.ticksRemaining),
          phase: markerPhase(lineageId),
        }
      })
      .filter((marker): marker is Marker => marker !== null)
      .slice(0, MAX_MARKERS)
  }, [lineageHomes, organisms, settlements, strategies, tick])

  return (
    <group name="strategy-markers">
      {markers.map((marker) => (
        <StrategyMarker key={marker.key} marker={marker} depthMap={depthMap} biomes={biomes} />
      ))}
    </group>
  )
}
