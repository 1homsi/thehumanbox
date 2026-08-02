import { useMemo, useRef } from 'react'
import { Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Color, Mesh, Object3D, AdditiveBlending, FogExp2 } from 'three'
import { TILE_SCALE } from './constants'
import { getWildernessPalette } from './wilderness-palette'
import { PosterSky } from './PosterSky'

interface Props {
  dayProgress: number
  width: number
  height: number
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
  weatherIntensity?: number
  moonIllum?: number
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function Sun({
  dayProgress,
  width,
  height,
  weatherKind = 'clear',
  weatherIntensity = 0,
  moonIllum = 0.7,
}: Props) {
  const cx = width * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const r = Math.max(width, height) * TILE_SCALE * 1.2
  const stormFactor =
    weatherKind === 'storm'
      ? 0.45 + weatherIntensity * 0.25
      : weatherKind === 'rain'
        ? 0.7 + weatherIntensity * 0.15
        : 1.0
  const dawn = (dayProgress - 0.25) * 2 * Math.PI
  const sunAlt = Math.sin(dawn)
  const sunAz = Math.cos(dawn)
  const sunPos = useMemo<[number, number, number]>(
    () => [cx - sunAz * r, sunAlt * r * 0.8, cz],
    [cx, cz, r, sunAz, sunAlt],
  )
  const sunDirection = useMemo<[number, number, number]>(() => [-sunAz, sunAlt * 0.8, 0], [sunAz, sunAlt])

  const dayWeight = smoothstep(-0.08, 0.18, sunAlt)
  const nightWeight = 1 - dayWeight
  const twilightWeight = 1 - Math.abs(sunAlt) / 0.25
  const isTwilight = twilightWeight > 0
  const dayStrength = Math.max(0, sunAlt)
  const palette = getWildernessPalette(dayProgress, weatherKind)

  const moonPos = useMemo<[number, number, number]>(
    () => [cx + sunAz * r * 0.8, -sunAlt * r * 0.8, cz],
    [cx, cz, r, sunAz, sunAlt],
  )
  const moonRef = useRef<Mesh>(null)
  const shadowTarget = useMemo(() => {
    const t = new Object3D()
    t.position.set(cx, 0, cz)
    return t
  }, [cx, cz])
  const shadowHalf = 190
  const fwdScratch = useRef({ x: 0, z: 0 })
  useFrame(({ clock, camera }) => {
    const focus = Math.min(120, Math.max(40, camera.position.y * 0.9))
    const ex = camera.matrixWorld.elements
    fwdScratch.current.x = -ex[8]
    fwdScratch.current.z = -ex[10]
    shadowTarget.position.set(
      camera.position.x + fwdScratch.current.x * focus,
      0,
      camera.position.z + fwdScratch.current.z * focus,
    )
    shadowTarget.updateMatrixWorld()
    if (!moonRef.current) return
    const t = clock.getElapsedTime()
    const s = 1 + Math.sin(t * 0.5) * 0.02
    moonRef.current.scale.set(s, s, s)
  })

  // Keep the sun graphic and poster-like. Broad, similarly opaque spheres read
  // as concentric rings from the aerial camera instead of atmospheric glow.
  const sunCoreOpacity = dayWeight * 0.94
  const sunHazeOpacity = Math.max(dayWeight * (isTwilight ? 0.14 : 0.07), 0)
  const sunOuterOpacity = Math.max(dayWeight * (isTwilight ? 0.045 : 0.018), 0)

  const moonOpacity = nightWeight * (0.15 + moonIllum * 0.85) + dayWeight * 0.6
  const moonGlowOpacity = nightWeight * moonIllum * 0.18

  const sunColorCore = dayStrength < 0.18 ? '#ff8c4a' : dayStrength < 0.4 ? '#ffc580' : '#fff6d8'
  const sunColorHaze = dayStrength < 0.18 ? '#ff6a30' : dayStrength < 0.4 ? '#ffb068' : '#fff0c0'
  const sunColorOuter = dayStrength < 0.18 ? '#ff5e2d' : dayStrength < 0.4 ? '#ff9b56' : '#ffe8a0'

  const dirSunIntensity = (0.62 + dayStrength * 1.08) * stormFactor * dayWeight
  const dirSunColor = palette.sun

  const dirMoonIntensity = (0.25 + 0.7 * moonIllum) * stormFactor * nightWeight

  const ambientIntensity = nightWeight * 0.24 + dayWeight * (0.28 + dayStrength * 0.24)
  const hemiIntensity = (nightWeight * 0.24 + dayWeight * (0.34 + dayStrength * 0.15)) * stormFactor

  return (
    <>
      <color attach="background" args={[palette.skyTop]} />
      <PosterSky palette={palette} sunDirection={sunDirection} />

      <group visible={nightWeight > 0.55}>
        <Stars radius={1600} depth={350} count={2600} factor={4} saturation={0.12} fade speed={0.35} />
      </group>

      <mesh ref={moonRef} position={moonPos} frustumCulled={false}>
        <sphereGeometry args={[40 + moonIllum * 30, 16, 12]} />
        <meshBasicMaterial
          color={nightWeight > 0.5 ? (moonIllum < 0.05 ? '#1a1c28' : '#f0f4ff') : '#c8d0e8'}
          transparent
          opacity={moonOpacity}
          toneMapped={false}
        />
      </mesh>
      <mesh position={moonPos} frustumCulled={false} renderOrder={-2}>
        <sphereGeometry args={[100 + moonIllum * 80, 16, 12]} />
        <meshBasicMaterial
          color="#cad8f8"
          transparent
          opacity={moonGlowOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh position={sunPos} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[isTwilight ? 52 : 42, 24, 18]} />
        <meshBasicMaterial
          color={sunColorCore}
          transparent
          opacity={sunCoreOpacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={sunPos} frustumCulled={false} renderOrder={-2}>
        <sphereGeometry args={[isTwilight ? 128 : 96, 24, 16]} />
        <meshBasicMaterial
          color={sunColorHaze}
          transparent
          opacity={sunHazeOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={sunPos} frustumCulled={false} renderOrder={-3}>
        <sphereGeometry args={[isTwilight ? 280 : 200, 16, 12]} />
        <meshBasicMaterial
          color={sunColorOuter}
          transparent
          opacity={sunOuterOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <primitive object={shadowTarget} />
      <directionalLight
        position={sunPos}
        target={shadowTarget}
        intensity={dirSunIntensity}
        color={dirSunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.06}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={shadowHalf}
        shadow-camera-bottom={-shadowHalf}
        shadow-camera-near={1}
        shadow-camera-far={4000}
      />

      <directionalLight position={moonPos} intensity={dirMoonIntensity} color="#a8b8e0" />

      <ambientLight intensity={ambientIntensity} color={palette.ambient} />

      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, hemiIntensity]} />

      <primitive
        attach="fog"
        object={
          new FogExp2(
            new Color(palette.fog),
            weatherKind === 'storm'
              ? 0.00135
              : weatherKind === 'rain'
                ? 0.00088
                : weatherKind === 'wet'
                  ? 0.0007
                  : nightWeight * 0.00072 + dayWeight * (isTwilight ? 0.00062 : 0.00046),
          )
        }
      />
    </>
  )
}
