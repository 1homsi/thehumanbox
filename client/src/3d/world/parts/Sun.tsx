import { useMemo, useRef } from 'react'
import { Sky, Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Color, Mesh, Object3D, AdditiveBlending, FogExp2 } from 'three'
import { TILE_SCALE } from './constants'

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

  const dayWeight = smoothstep(-0.08, 0.18, sunAlt)
  const nightWeight = 1 - dayWeight
  const twilightWeight = 1 - Math.abs(sunAlt) / 0.25
  const isTwilight = twilightWeight > 0
  const dayStrength = Math.max(0, sunAlt)

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

  const skyTurbidity = 4 + Math.max(0, 1 - dayWeight) * 4
  const skyRayleigh = 2 + Math.max(0, 1 - dayWeight) * 2.5

  const bgR = nightWeight * 0.03 + dayWeight * (dayStrength * 0.45 + 0.18)
  const bgG = nightWeight * 0.05 + dayWeight * (dayStrength * 0.55 + 0.22)
  const bgB = nightWeight * 0.1 + dayWeight * (dayStrength * 0.55 + 0.42)

  const sunCoreOpacity = dayWeight
  const sunHazeOpacity = Math.max(dayWeight * (isTwilight ? 0.55 : 0.28), 0)
  const sunOuterOpacity = Math.max(dayWeight * (isTwilight ? 0.22 : 0.1), 0)
  const sunAtmosOpacity = Math.max(dayWeight * (isTwilight ? 0.12 : 0.045), 0)

  const moonOpacity = nightWeight * (0.15 + moonIllum * 0.85) + dayWeight * 0.6
  const moonGlowOpacity = nightWeight * moonIllum * 0.18

  const sunColorCore = dayStrength < 0.18 ? '#ff8c4a' : dayStrength < 0.4 ? '#ffc580' : '#fff6d8'
  const sunColorHaze = dayStrength < 0.18 ? '#ff6a30' : dayStrength < 0.4 ? '#ffb068' : '#fff0c0'
  const sunColorOuter = dayStrength < 0.18 ? '#ff5020' : dayStrength < 0.4 ? '#ff9050' : '#ffe8a0'
  const sunColorAtmos = dayStrength < 0.18 ? '#ff4818' : dayStrength < 0.4 ? '#ff7848' : '#ffd890'

  const dirSunIntensity = (0.45 + dayStrength * 1.1) * stormFactor * dayWeight
  const dirSunColor =
    weatherKind === 'storm'
      ? '#8a98b8'
      : dayStrength < 0.15
        ? '#ff8c4a'
        : dayStrength < 0.35
          ? '#ffb878'
          : '#fff4dc'

  const dirMoonIntensity = (0.25 + 0.7 * moonIllum) * stormFactor * nightWeight

  const ambientIntensity = nightWeight * 0.7 + dayWeight * (0.65 + dayStrength * 0.2)
  const ambR = nightWeight * 0.8 + dayWeight * 1
  const ambG = nightWeight * 0.86 + dayWeight * 1
  const ambB = nightWeight * 1 + dayWeight * 1

  const hemiSky = new Color()
    .setRGB(
      nightWeight * 0.29 + dayWeight * 0.61,
      nightWeight * 0.34 + dayWeight * 0.72,
      nightWeight * 0.47 + dayWeight * 0.88,
    )
    .getHex()
  const hemiGround = new Color()
    .setRGB(
      nightWeight * 0.1 + dayWeight * 0.24,
      nightWeight * 0.13 + dayWeight * 0.37,
      nightWeight * 0.19 + dayWeight * 0.24,
    )
    .getHex()
  const hemiIntensity = (nightWeight * 0.3 + dayWeight * (0.4 + dayStrength * 0.2)) * stormFactor

  return (
    <>
      <color attach="background" args={[new Color().setRGB(bgR, bgG, bgB).getHex()]} />

      {dayWeight > 0.05 && (
        <Sky
          distance={100000}
          sunPosition={sunPos}
          turbidity={skyTurbidity}
          rayleigh={skyRayleigh}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
        />
      )}

      <Stars radius={1600} depth={350} count={8500} factor={7} saturation={0.12} fade speed={0.6} />

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
        <sphereGeometry args={[isTwilight ? 75 : 55, 24, 18]} />
        <meshBasicMaterial
          color={sunColorCore}
          transparent
          opacity={sunCoreOpacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={sunPos} frustumCulled={false} renderOrder={-2}>
        <sphereGeometry args={[isTwilight ? 220 : 150, 24, 16]} />
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
        <sphereGeometry args={[isTwilight ? 520 : 320, 16, 12]} />
        <meshBasicMaterial
          color={sunColorOuter}
          transparent
          opacity={sunOuterOpacity}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={sunPos} frustumCulled={false} renderOrder={-4}>
        <sphereGeometry args={[isTwilight ? 1100 : 700, 12, 10]} />
        <meshBasicMaterial
          color={sunColorAtmos}
          transparent
          opacity={sunAtmosOpacity}
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
        shadow-mapSize={[1024, 1024]}
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

      <ambientLight intensity={ambientIntensity} color={new Color(ambR, ambG, ambB).getHex()} />

      <hemisphereLight args={[hemiSky, hemiGround, hemiIntensity]} />

      <primitive
        attach="fog"
        object={(() => {
          // Use the same cyclic day/night mix as the lights. The former ramp
          // jumped from dark blue to bright peach at midnight.
          const c = new Color(bgR, bgG, bgB)
          const baseDensity =
            weatherKind === 'storm'
              ? 0.0024
              : weatherKind === 'rain'
                ? 0.0014
                : nightWeight * 0.001 + dayWeight * (isTwilight ? 0.0009 : 0.0006)
          return new FogExp2(c, baseDensity)
        })()}
      />
    </>
  )
}
