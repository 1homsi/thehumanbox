import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, BoxGeometry, MeshBasicMaterial } from 'three'
import { TILE_SCALE } from './constants'

// One shared geometry + material for all streaks instead of allocating a
// fresh pair per mesh.
const STREAK_GEO = new BoxGeometry(1, 0.6, 0.6)
const STREAK_MAT = new MeshBasicMaterial({
  color: '#fff8d8',
  transparent: true,
  opacity: 0.95,
  toneMapped: false,
})

interface Props {
  isNight: boolean
  width: number
  height: number
}

interface Streak {
  active: boolean
  pos: Vector3
  vel: Vector3
  life: number
  maxLife: number
  length: number
}

const MAX_STREAKS = 8
const SHOWER_PROBABILITY = 0.04

export function ShootingStars({ isNight, width, height }: Props) {
  const streaks = useMemo<Streak[]>(
    () =>
      Array.from({ length: MAX_STREAKS }, () => ({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        life: 0,
        maxLife: 1.2,
        length: 80,
      })),
    [],
  )

  const nextSpawnRef = useRef<number>(performance.now() + 8_000 + Math.random() * 18_000)
  const refsArray = useRef<Array<HTMLElement | null>>([])

  const cx = (width * TILE_SCALE) / 2
  const cz = (height * TILE_SCALE) / 2
  const skyR = Math.max(width, height) * TILE_SCALE * 1.0

  useFrame((_, delta) => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (delta > 0.1) return
    const now = performance.now()

    if (isNight && now >= nextSpawnRef.current) {
      const shower = Math.random() < SHOWER_PROBABILITY
      const count = shower ? 4 + Math.floor(Math.random() * 4) : 1
      const baseAz = Math.random() * Math.PI * 2
      let spawned = 0
      for (const slot of streaks) {
        if (spawned >= count) break
        if (slot.active) continue
        const az = shower ? baseAz + (Math.random() - 0.5) * 0.4 : Math.random() * Math.PI * 2
        const startY = skyR * (0.5 + Math.random() * 0.3)
        slot.pos.set(cx + Math.cos(az) * skyR * 0.8, startY, cz + Math.sin(az) * skyR * 0.8)
        const arcAz = az + (Math.random() - 0.5) * 1.2
        const speed = 320 + Math.random() * 240
        slot.vel.set(
          Math.cos(arcAz) * -speed * 0.7,
          -speed * (0.35 + Math.random() * 0.25),
          Math.sin(arcAz) * -speed * 0.7,
        )
        slot.life = -spawned * 0.18
        slot.maxLife = 0.9 + Math.random() * 0.7
        slot.length = 60 + Math.random() * 80
        slot.active = true
        spawned++
      }
      nextSpawnRef.current = shower
        ? now + 90_000 + Math.random() * 120_000
        : now + 6_000 + Math.random() * 22_000
    }

    if (!isNight && streaks.every((s) => !s.active)) return

    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i]
      const el = refsArray.current[i] as unknown as {
        position: Vector3
        scale: Vector3
        visible: boolean
      } | null
      if (!s.active) {
        if (el) el.visible = false
        continue
      }
      s.life += delta
      if (s.life < 0) {
        if (el) el.visible = false
        continue
      }
      s.pos.addScaledVector(s.vel, delta)
      if (s.life >= s.maxLife) {
        s.active = false
        if (el) el.visible = false
        continue
      }
      if (el) {
        el.visible = true
        el.position.copy(s.pos)
        const fade = 1 - s.life / s.maxLife
        el.scale.set(s.length * fade, 1, 1)
      }
    }
  })

  return (
    <>
      {streaks.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refsArray.current[i] = el as unknown as HTMLElement | null
          }}
          geometry={STREAK_GEO}
          material={STREAK_MAT}
          frustumCulled={false}
          visible={false}
          renderOrder={-1}
        />
      ))}
    </>
  )
}
