import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Object3D, SphereGeometry, MeshBasicMaterial } from 'three'
import type { Building } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'

interface Props {
  buildings: Building[] | undefined
  depthMap: number[][] | undefined
  biomes: number[][] | undefined
}

const MAX_SPARKS = 60
const tmp = new Object3D()
const GEO = new SphereGeometry(0.06, 4, 3)
const MAT = new MeshBasicMaterial({
  color: '#ffb060',
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  toneMapped: false,
})

interface Spark {
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
}

export function BuildSparks({ buildings, depthMap, biomes }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: MAX_SPARKS }, () => ({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.6,
      })),
    [],
  )
  const nextSpawnRef = useRef<number>(0)

  const sites = useMemo(() => {
    if (!buildings || !depthMap || !biomes) return []
    const out: Array<{ x: number; y: number; z: number; rate: number }> = []
    for (const b of buildings) {
      const c = b.condition ?? 1
      if (c >= 0.97 || c < 0.05) continue
      const fw = b.fw ?? 1
      const fh = b.fh ?? 1
      const wx = (b.x + fw / 2) * TILE_SCALE
      const wz = (b.y + fh / 2) * TILE_SCALE
      const wy = heightAt(b.x, b.y, depthMap, biomes)
      const rate = (1 - c) * 0.9
      out.push({ x: wx, y: wy + 1.2, z: wz, rate })
    }
    return out
  }, [buildings, depthMap, biomes])

  useFrame((_, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (delta > 0.1) return
    const mesh = meshRef.current
    if (!mesh) return
    const now = performance.now()

    if (sites.length > 0 && now >= nextSpawnRef.current) {
      const site = sites[Math.floor(Math.random() * sites.length)]
      const slot = sparks.find((s) => !s.active)
      if (slot) {
        slot.active = true
        slot.x = site.x + (Math.random() - 0.5) * 1.5
        slot.y = site.y
        slot.z = site.z + (Math.random() - 0.5) * 1.5
        const az = Math.random() * Math.PI * 2
        const r = 1.2 + Math.random() * 0.8
        slot.vx = Math.cos(az) * r
        slot.vy = 2 + Math.random() * 1.5
        slot.vz = Math.sin(az) * r
        slot.life = 0
        slot.maxLife = 0.5 + Math.random() * 0.35
      }
      nextSpawnRef.current = now + 30 + Math.random() * 90
    }

    let visible = 0
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i]
      if (!s.active) continue
      s.life += delta
      if (s.life >= s.maxLife) {
        s.active = false
        continue
      }
      s.vy -= 9 * delta
      s.x += s.vx * delta
      s.y += s.vy * delta
      s.z += s.vz * delta
      const fade = 1 - s.life / s.maxLife
      tmp.position.set(s.x, s.y, s.z)
      tmp.scale.setScalar(fade)
      tmp.rotation.set(0, 0, 0)
      tmp.updateMatrix()
      mesh.setMatrixAt(visible, tmp.matrix)
      visible++
    }
    mesh.count = visible
    mesh.instanceMatrix.needsUpdate = true
  })

  if (sites.length === 0) return null
  return <instancedMesh ref={meshRef} args={[GEO, MAT, MAX_SPARKS]} frustumCulled={false} renderOrder={-1} />
}
