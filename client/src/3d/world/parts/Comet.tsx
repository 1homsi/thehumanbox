import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh, AdditiveBlending } from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  isNight: boolean
  dayOfYear: number | undefined
  width: number
  height: number
}

const APPEARANCES_PER_YEAR = 1
const APPEARANCE_WINDOW = 24

function hashYear(year: number): number {
  const x = Math.sin(year * 374.13) * 9301.7
  return x - Math.floor(x)
}

export function Comet({ isNight, dayOfYear, width, height }: Props) {
  const year = useMemo(() => Math.floor((dayOfYear ?? 0) / 365), [dayOfYear])
  const visit = useMemo(() => {
    const start = Math.floor(hashYear(year + 101) * (365 - APPEARANCE_WINDOW))
    const azStart = hashYear(year + 7) * Math.PI * 2
    const azEnd = azStart + (hashYear(year + 19) - 0.5) * 1.4
    const altStart = 0.45 + hashYear(year + 53) * 0.3
    return { start, azStart, azEnd, altStart, slots: APPEARANCES_PER_YEAR }
  }, [year])

  const cx = (width * TILE_SCALE) / 2
  const cz = (height * TILE_SCALE) / 2
  const skyR = Math.max(width, height) * TILE_SCALE * 0.9

  const day = dayOfYear ?? 0
  const localDay = day % 365
  const t01 =
    visit.slots > 0 && localDay >= visit.start && localDay < visit.start + APPEARANCE_WINDOW
      ? (localDay - visit.start) / APPEARANCE_WINDOW
      : null

  const headRef = useRef<Mesh>(null)
  const tailRef = useRef<Mesh>(null)
  const haloRef = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    if (t01 === null || !isNight) {
      if (headRef.current) headRef.current.visible = false
      if (tailRef.current) tailRef.current.visible = false
      if (haloRef.current) haloRef.current.visible = false
      return
    }
    const az = visit.azStart + (visit.azEnd - visit.azStart) * t01
    const altFactor = Math.sin(t01 * Math.PI)
    const alt = visit.altStart * altFactor + 0.1
    const x = cx + Math.cos(az) * skyR * 0.85
    const y = alt * skyR
    const z = cz + Math.sin(az) * skyR * 0.85

    const shimmer = 1 + Math.sin(clock.getElapsedTime() * 2.4) * 0.06

    if (headRef.current) {
      headRef.current.visible = true
      headRef.current.position.set(x, y, z)
      headRef.current.scale.setScalar(shimmer * (0.7 + altFactor * 0.3))
    }
    if (tailRef.current) {
      tailRef.current.visible = true
      const tailDir = az + Math.PI
      const tailLen = 220 + altFactor * 90
      tailRef.current.position.set(x + Math.cos(tailDir) * tailLen * 0.5, y + 18, z + Math.sin(tailDir) * tailLen * 0.5)
      tailRef.current.rotation.y = -tailDir + Math.PI / 2
      tailRef.current.scale.set(tailLen, 18 + altFactor * 8, 1)
    }
    if (haloRef.current) {
      haloRef.current.visible = true
      haloRef.current.position.set(x, y, z)
      haloRef.current.scale.setScalar(2.2 + Math.sin(clock.getElapsedTime() * 1.2) * 0.15)
    }
  })

  if (t01 === null) return null

  return (
    <group renderOrder={-1}>
      <mesh ref={haloRef} frustumCulled={false} visible={false}>
        <sphereGeometry args={[28, 16, 12]} />
        <meshBasicMaterial color="#bfe6ff" transparent opacity={0.28} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={headRef} frustumCulled={false} visible={false}>
        <sphereGeometry args={[12, 16, 12]} />
        <meshBasicMaterial color="#fff8dc" transparent opacity={0.95} toneMapped={false} />
      </mesh>
      <mesh ref={tailRef} frustumCulled={false} visible={false} renderOrder={-2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#cfeaff" transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
