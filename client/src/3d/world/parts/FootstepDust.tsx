import { visitDustCandidates, pruneDustEmitters } from './dust-budget'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { InstancedMesh, Object3D, SphereGeometry } from 'three'
import type { OrganismState } from '../../../types'
import { TILE_SCALE } from './constants'
import { heightAt } from './terrain-utils'
import { getOrgXY, getOrgVelocityXY } from './motion-state'

interface Props {
  organisms: OrganismState[]
  depthMap: number[][]
  biomes: number[][]
}

const N_PARTICLES = 200
const PARTICLE_LIFE = 1.2
const NEAR_RADIUS_SQ = 180 * 180
const PARTICLE_GEO = new SphereGeometry(0.08, 4, 3)

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vz: number
  born: number
}

const tmp = new Object3D()

export function FootstepDust({ organisms, depthMap, biomes }: Props) {
  const meshRef = useRef<InstancedMesh>(null)
  const pool = useRef<Particle[]>([])
  const lastSpawn = useRef<Map<string, [number, number]>>(new Map())
  const nextParticle = useRef(0)
  const nextEmitter = useRef(0)
  const { camera } = useThree()
  useEffect(() => {
    pruneDustEmitters(lastSpawn.current, new Set(organisms.filter((o) => o.alive).map((o) => o.id)))
  }, [organisms])

  useMemo(() => {
    pool.current = []
    for (let i = 0; i < N_PARTICLES; i++) {
      pool.current.push({ x: 0, y: -1000, z: 0, vx: 0, vz: 0, born: -PARTICLE_LIFE * 1000 })
    }
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const now = performance.now()

    nextEmitter.current = visitDustCandidates(organisms.length, nextEmitter.current, (index) => {
      const o = organisms[index]
      if (!o.alive) return false
      const [tx, ty] = getOrgXY(o.id)
      const wx = tx * TILE_SCALE
      const wz = ty * TILE_SCALE
      const dx = wx - camera.position.x
      const dz = wz - camera.position.z
      if (dx * dx + dz * dz > NEAR_RADIUS_SQ) return false
      const [vx, vy] = getOrgVelocityXY(o.id)
      const speed = Math.hypot(vx, vy)
      if (speed < 0.04) return false
      const last = lastSpawn.current.get(o.id)
      const movedSq = last ? (tx - last[0]) ** 2 + (ty - last[1]) ** 2 : Infinity
      if (movedSq < 0.2) return false
      lastSpawn.current.set(o.id, [tx, ty])

      const slot = nextParticle.current
      nextParticle.current = (slot + 1) % N_PARTICLES
      const groundY = heightAt(tx, ty, depthMap, biomes)
      const offX = -vx * 0.4 + (Math.random() - 0.5) * 0.3
      const offZ = -vy * 0.4 + (Math.random() - 0.5) * 0.3
      pool.current[slot] = {
        x: wx + offX,
        y: groundY + 0.12,
        z: wz + offZ,
        vx: -vx * 0.8 + (Math.random() - 0.5) * 0.6,
        vz: -vy * 0.8 + (Math.random() - 0.5) * 0.6,
        born: now,
      }
      return true
    })

    for (let i = 0; i < N_PARTICLES; i++) {
      const p = pool.current[i]
      const ageMs = now - p.born
      if (ageMs >= PARTICLE_LIFE * 1000 || p.y < -100) {
        tmp.position.set(0, -1000, 0)
        tmp.scale.set(0, 0, 0)
        tmp.updateMatrix()
        mesh.setMatrixAt(i, tmp.matrix)
        continue
      }
      const life = ageMs / 1000 / PARTICLE_LIFE
      const dt = life * PARTICLE_LIFE
      const px = p.x + p.vx * dt
      const py = p.y + life * 0.4
      const pz = p.z + p.vz * dt
      const scale = (0.6 + life * 1.2) * (1 - life * 0.4)
      tmp.position.set(px, py, pz)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(scale, scale, scale)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[PARTICLE_GEO, undefined, N_PARTICLES]}
      count={N_PARTICLES}
      frustumCulled={false}
    >
      <meshBasicMaterial color="#b0a48a" transparent opacity={0.42} depthWrite={false} />
    </instancedMesh>
  )
}
