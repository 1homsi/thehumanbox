import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConeGeometry, MeshBasicMaterial, Group, AdditiveBlending } from 'three'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
  isNight: boolean
}

const WATCHER_KINDS = new Set([
  'watchtower',
  'lighthouse',
  'fortress',
  'castle',
  'observatory',
])

const BEAM_GEO = new ConeGeometry(8, 60, 18, 1, true)
BEAM_GEO.translate(0, 30, 0)
BEAM_GEO.rotateX(Math.PI / 2)

export function WatchtowerBeams({ buildings, depthMap, biomes, isNight }: Props) {
  const sources = useMemo(() => {
    if (!buildings || !depthMap || !biomes) return []
    const out: Array<{ x: number; y: number; z: number; phase: number; warm: boolean }> = []
    for (const b of buildings) {
      if ((b.condition ?? 1) < 0.6) continue
      const kind = b.kind.toLowerCase()
      if (!WATCHER_KINDS.has(kind)) continue
      const fw = b.fw ?? 1
      const fh = b.fh ?? 1
      const wx = (b.x + fw / 2) * TILE_SCALE
      const wz = (b.y + fh / 2) * TILE_SCALE
      const wy = heightAt(b.x, b.y, depthMap, biomes) + 4
      out.push({ x: wx, y: wy, z: wz, phase: (b.id * 13) % 6.28, warm: kind === 'lighthouse' })
    }
    return out
  }, [buildings, depthMap, biomes])

  const refs = useRef<Array<Group | null>>([])

  useFrame(({ clock }) => {
    if (!isNight) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < sources.length; i++) {
      const grp = refs.current[i]
      if (!grp) continue
      grp.rotation.y = t * 0.6 + sources[i].phase
    }
  })

  if (!isNight || sources.length === 0) return null

  return (
    <>
      {sources.map((src, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          position={[src.x, src.y, src.z]}
        >
          <mesh geometry={BEAM_GEO} frustumCulled={false} renderOrder={-1}>
            <meshBasicMaterial
              color={src.warm ? '#ffd28a' : '#bfe6ff'}
              transparent
              opacity={0.18}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
              side={2}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}

void MeshBasicMaterial
