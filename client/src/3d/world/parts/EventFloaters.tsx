import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import type { OrganismState, SimEvent } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY } from './motion-state'

interface Props {
  events: SimEvent[]
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
}

const FLOATER_LIFE_MS = 4200
const MAX_FLOATERS = 24

interface Floater {
  key: string
  text: string
  color: string
  worldX: number
  worldY: number
  worldZ: number
  born: number
}

const EVENT_COLOR: Record<string, string> = {
  born: '#88e0a0',
  died: '#e87878',
  signal: '#ffdd66',
  alarm: '#ff7748',
  challenge: '#ff5050',
  gift: '#a8c8ff',
  treaty: '#d0a8ff',
  build: '#c8b070',
  social: '#ffc870',
  weather: '#9bb8e0',
  era: '#f0d878',
  drought: '#d8a060',
  outbreak: '#cc5cb0',
  season: '#a0d8c8',
  dawn: '#ffd498',
  dusk: '#cc8a78',
}

function shortDetail(e: SimEvent): string {
  const d = e.detail || ''
  if (d.length <= 36) return d
  return d.slice(0, 33) + '…'
}

export function EventFloaters({ events, organisms, depthMap, biomes }: Props) {
  const seenRef = useRef<Set<string>>(new Set())
  const floatersRef = useRef<Floater[]>([])
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => (v + 1) & 0x7fffffff)

  const orgByName = useMemo(() => {
    const m = new Map<string, OrganismState>()
    for (const o of organisms) if (o.alive) m.set(o.name, o)
    return m
  }, [organisms])

  let spawned = 0
  for (const e of events) {
    const key = `${e.tick}|${e.actor}|${e.type}|${e.detail}`
    if (seenRef.current.has(key)) continue
    seenRef.current.add(key)
    const org = orgByName.get(e.actor)
    if (!org) continue
    const [tx, ty] = getOrgXY(org.id)
    const groundY = heightAt(tx, ty, depthMap, biomes)
    floatersRef.current.push({
      key,
      text: shortDetail(e),
      color: EVENT_COLOR[e.type] ?? '#ffffff',
      worldX: tx * TILE_SCALE,
      worldY: groundY + 3.2,
      worldZ: ty * TILE_SCALE,
      born: performance.now(),
    })
    spawned++
  }
  if (floatersRef.current.length > MAX_FLOATERS) {
    floatersRef.current.splice(0, floatersRef.current.length - MAX_FLOATERS)
  }
  if (seenRef.current.size > 1000) {
    seenRef.current = new Set(Array.from(seenRef.current).slice(-500))
  }
  if (spawned > 0) queueMicrotask(bump)

  useFrame(() => {
    const now = performance.now()
    const before = floatersRef.current.length
    floatersRef.current = floatersRef.current.filter((f) => now - f.born < FLOATER_LIFE_MS)
    if (floatersRef.current.length !== before) bump()
  })

  const now = performance.now()
  return (
    <>
      {floatersRef.current.map((f) => {
        const age = (now - f.born) / FLOATER_LIFE_MS
        const rise = age * 6
        const fade = Math.max(0, 1 - age)
        return (
          <Billboard key={f.key} position={[f.worldX, f.worldY + rise, f.worldZ]} frustumCulled={false}>
            <Text
              fontSize={0.6}
              color={f.color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.04}
              outlineColor="#000000"
              outlineOpacity={fade * 0.9}
              fillOpacity={fade}
              renderOrder={996}
            >
              {f.text}
            </Text>
          </Billboard>
        )
      })}
    </>
  )
}
