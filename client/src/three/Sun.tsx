import { useMemo } from 'react'
import { Sky } from '@react-three/drei'
import { TILE_SCALE } from './constants'

interface Props {
  dayProgress: number  // 0..1 — 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset
  width:  number
  height: number
}

// Sun position + sky tint follow day_progress so the world's lighting
// matches the 2D overlay. dayProgress comes straight from the WS
// payload (already lerped client-side), so 3D and 2D stay in sync.
//
// Sun travels a half-circle east -> overhead -> west during daytime
// (0.05..0.55 in day_progress space, with 0.0/1.0 = midnight). Phase 4
// can add a moon, stars, weather tinting.
export function Sun({ dayProgress, width, height }: Props) {
  const sunPos = useMemo<[number, number, number]>(() => {
    // Map 0.05..0.55 day_progress -> 0..PI (sunrise to sunset arc).
    const dawn = 0.05
    const dusk = 0.55
    const t = (dayProgress - dawn) / (dusk - dawn)
    const tClamped = Math.max(0, Math.min(1, t))
    const angle = tClamped * Math.PI

    // Radius and origin: orbit the world center, well above terrain.
    const cx = width  * TILE_SCALE * 0.5
    const cz = height * TILE_SCALE * 0.5
    const r  = Math.max(width, height) * TILE_SCALE * 1.2
    const sunX = cx + Math.cos(angle + Math.PI) * r
    const sunY = Math.sin(angle) * r * 0.7 + 20
    const sunZ = cz
    return [sunX, sunY, sunZ]
  }, [dayProgress, width, height])

  // Night: sky stays but with adjusted turbidity so it darkens.
  const isNight = dayProgress < 0.05 || dayProgress > 0.55
  const turbidity = isNight ? 12 : 4
  const rayleigh = isNight ? 0.2 : 2

  return (
    <>
      <Sky
        distance={2000}
        sunPosition={sunPos}
        turbidity={turbidity}
        rayleigh={rayleigh}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <directionalLight
        position={sunPos}
        intensity={isNight ? 0.15 : 1.2}
        color={isNight ? '#aab5cc' : '#fff6e0'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-camera-near={1}
        shadow-camera-far={2000}
      />
      <ambientLight intensity={isNight ? 0.25 : 0.45} color={isNight ? '#3a4a6a' : '#ffffff'} />
    </>
  )
}
