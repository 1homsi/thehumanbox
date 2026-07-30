import { Line, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, Group } from 'three'
import type { CaravanInfo, TradeRouteInfo } from '../../../types'
import { lineageColor } from '../../../utils/constants'
import { FaceCamera } from './FaceCamera'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  routes?: TradeRouteInfo[]
  caravans?: CaravanInfo[]
  tick: number
  depthMap: number[][]
  biomes: number[][]
  originX: number
  originY: number
}

interface RouteVisual {
  id: number
  points: [number, number, number][]
  colors: Color[]
}

interface CaravanVisual {
  id: number
  x: number
  y: number
  groundY: number
  heading: number
  color: string
  cargo: string
  amount: number
  phase: number
}

const MAX_ROUTES = 48
const MAX_CARAVANS = 40
const ROUTE_SEGMENTS = 12

function finitePoint(point: [number, number]): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1])
}

function cargoGlyph(cargo: string): string {
  const normalized = cargo.toLowerCase()
  if (normalized.includes('food') || normalized.includes('fruit')) return '🍎'
  if (normalized.includes('grain') || normalized.includes('wheat')) return '🌾'
  if (normalized.includes('wood') || normalized.includes('timber')) return '🪵'
  if (normalized.includes('stone') || normalized.includes('ore')) return '🪨'
  if (normalized.includes('water')) return '💧'
  if (normalized.includes('cloth') || normalized.includes('wool')) return '🧶'
  return '📦'
}

function routeIntersectsViewport(
  from: [number, number],
  to: [number, number],
  width: number,
  height: number,
): boolean {
  const margin = 6
  return !(
    Math.max(from[0], to[0]) < -margin ||
    Math.min(from[0], to[0]) > width + margin ||
    Math.max(from[1], to[1]) < -margin ||
    Math.min(from[1], to[1]) > height + margin
  )
}

function CaravanMarker({ caravan }: { caravan: CaravanVisual }) {
  const markerRef = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (!markerRef.current) return
    markerRef.current.position.y =
      caravan.groundY + 0.7 + Math.sin(clock.getElapsedTime() * 4.2 + caravan.phase) * 0.18
  })

  return (
    <group
      ref={markerRef}
      position={[caravan.x * TILE_SCALE, caravan.groundY + 0.7, caravan.y * TILE_SCALE]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, 0]} renderOrder={16}>
        <ringGeometry args={[1.15, 1.42, 20]} />
        <meshBasicMaterial
          color={caravan.color}
          transparent
          opacity={0.52}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <group rotation={[0, -caravan.heading, 0]}>
        <mesh position={[0, 0.65, 0]} castShadow>
          <boxGeometry args={[2.25, 0.8, 1.45]} />
          <meshStandardMaterial color={caravan.color} roughness={0.72} metalness={0.08} />
        </mesh>
        <mesh position={[0, 1.36, 0]} castShadow>
          <boxGeometry args={[1.3, 0.92, 1.05]} />
          <meshStandardMaterial color="#9a7447" roughness={0.9} />
        </mesh>
        {[-0.78, 0.78].map((x) =>
          [-0.78, 0.78].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.3, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.34, 0.34, 0.16, 10]} />
              <meshStandardMaterial color="#27211b" roughness={0.92} />
            </mesh>
          )),
        )}
      </group>
      <FaceCamera position={[0, 3.05, 0]}>
        <Text
          fontSize={0.88}
          color="#ffffff"
          outlineWidth={0.055}
          outlineColor="#080b0d"
          outlineOpacity={0.95}
          anchorX="center"
          anchorY="middle"
          renderOrder={18}
          material-toneMapped={false}
          material-depthWrite={false}
        >
          {`${cargoGlyph(caravan.cargo)} ×${caravan.amount}`}
        </Text>
      </FaceCamera>
    </group>
  )
}

export function TradeRoutes3D({
  routes,
  caravans,
  tick,
  depthMap,
  biomes,
  originX,
  originY,
}: Props) {
  const width = depthMap[0]?.length ?? 0
  const height = depthMap.length
  const routeVisuals = useMemo<RouteVisual[]>(() => {
    const visuals: RouteVisual[] = []
    for (const route of routes ?? []) {
      if (!finitePoint(route.a_center) || !finitePoint(route.b_center)) continue
      const from: [number, number] = [route.a_center[0] - originX, route.a_center[1] - originY]
      const to: [number, number] = [route.b_center[0] - originX, route.b_center[1] - originY]
      if (!routeIntersectsViewport(from, to, width, height)) continue

      const lineageA = new Color(lineageColor(route.lineage_a))
      const lineageB = new Color(lineageColor(route.lineage_b))
      const points: [number, number, number][] = []
      const colors: Color[] = []
      for (let index = 0; index <= ROUTE_SEGMENTS; index++) {
        const progress = index / ROUTE_SEGMENTS
        const x = from[0] + (to[0] - from[0]) * progress
        const y = from[1] + (to[1] - from[1]) * progress
        const terrainY = heightAt(x, y, depthMap, biomes)
        points.push([
          x * TILE_SCALE,
          terrainY + 0.38 + Math.sin(progress * Math.PI) * 0.18,
          y * TILE_SCALE,
        ])
        colors.push(new Color().lerpColors(lineageA, lineageB, progress))
      }
      visuals.push({ id: route.id, points, colors })
      if (visuals.length >= MAX_ROUTES) break
    }
    return visuals
  }, [biomes, depthMap, height, originX, originY, routes, width])

  const caravanVisuals = useMemo<CaravanVisual[]>(() => {
    const visuals: CaravanVisual[] = []
    for (const caravan of caravans ?? []) {
      if (!finitePoint(caravan.from) || !finitePoint(caravan.to)) continue
      const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
      const progress = Math.max(0, Math.min(1, (tick - caravan.departed_tick) / duration))
      const x = caravan.from[0] + (caravan.to[0] - caravan.from[0]) * progress - originX
      const y = caravan.from[1] + (caravan.to[1] - caravan.from[1]) * progress - originY
      if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue
      visuals.push({
        id: caravan.id,
        x,
        y,
        groundY: heightAt(x, y, depthMap, biomes),
        heading: Math.atan2(caravan.to[1] - caravan.from[1], caravan.to[0] - caravan.from[0]),
        color: lineageColor(caravan.sender_lineage),
        cargo: caravan.cargo,
        amount: caravan.amount,
        phase: caravan.id * 0.731,
      })
      if (visuals.length >= MAX_CARAVANS) break
    }
    return visuals
  }, [biomes, caravans, depthMap, height, originX, originY, tick, width])

  if (routeVisuals.length === 0 && caravanVisuals.length === 0) return null

  return (
    <group name="trade-routes">
      {routeVisuals.map((route) => (
        <Line
          key={route.id}
          points={route.points}
          vertexColors={route.colors}
          lineWidth={1.15}
          dashed
          dashScale={1}
          dashSize={1.35}
          gapSize={0.85}
          transparent
          opacity={0.48}
          depthWrite={false}
          renderOrder={12}
          frustumCulled={false}
        />
      ))}
      {caravanVisuals.map((caravan) => (
        <CaravanMarker key={caravan.id} caravan={caravan} />
      ))}
    </group>
  )
}
