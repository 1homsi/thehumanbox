import { useMemo, useRef } from 'react'
import { Sky, Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Color, Mesh, AdditiveBlending, FogExp2 } from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  dayProgress: number
  width:  number
  height: number
  weatherKind?: 'clear' | 'rain' | 'storm' | 'wet'
  weatherIntensity?: number
}

export function Sun({ dayProgress, width, height, weatherKind = 'clear', weatherIntensity = 0 }: Props) {
  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const r  = Math.max(width, height) * TILE_SCALE * 1.2
  const stormFactor = weatherKind === 'storm' ? 0.45 + weatherIntensity * 0.25
                    : weatherKind === 'rain'  ? 0.7  + weatherIntensity * 0.15
                    : 1.0
  const dawn = (dayProgress - 0.25) * 2 * Math.PI
  const sunAlt = Math.sin(dawn)
  const sunAz  = Math.cos(dawn)
  const sunPos = useMemo<[number, number, number]>(() => [
    cx - sunAz * r,
    sunAlt * r * 0.8,
    cz,
  ], [cx, cz, r, sunAz, sunAlt])

  const dayStrength = Math.max(0, sunAlt)
  const isNight = sunAlt < 0
  const isTwilight = !isNight && dayStrength < 0.25

  const moonPos = useMemo<[number, number, number]>(() => [
    cx + sunAz * r * 0.8,
    -sunAlt * r * 0.8,
    cz,
  ], [cx, cz, r, sunAz, sunAlt])
  const moonRef = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!moonRef.current) return
    const t = clock.getElapsedTime()
    const s = 1 + Math.sin(t * 0.5) * 0.02
    moonRef.current.scale.set(s, s, s)
  })

  const skyTurbidity = isTwilight ? 6 : 4
  const skyRayleigh  = isTwilight ? 3.5 : 2

  return (
    <>
      <color
        attach="background"
        args={[
          new Color().setRGB(
            isNight     ? 0.03 :
            isTwilight  ? 0.55 + dayStrength * 0.40 :
                          dayStrength * 0.45 + 0.18,
            isNight     ? 0.05 :
            isTwilight  ? 0.38 + dayStrength * 0.45 :
                          dayStrength * 0.55 + 0.22,
            isNight     ? 0.10 :
            isTwilight  ? 0.30 + dayStrength * 0.55 :
                          dayStrength * 0.55 + 0.42,
          ).getHex(),
        ]}
      />

      {}
      {!isNight && (
        <Sky
          distance={100000}
          sunPosition={sunPos}
          turbidity={skyTurbidity}
          rayleigh={skyRayleigh}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
        />
      )}

      {/*
        Stars stay mounted with stable parameters across the whole
        day/night cycle. Previously `count`, `factor`, and `speed`
        flipped between day and night, which forced drei to rebuild
        the entire star buffer (~5000 points × position+random attrs)
        on every transition. The Sky component naturally occludes the
        stars during daylight, so we don't need to swap counts to hide
        them - the day-time render cost is the same as a 5000-point
        Points draw, which is one cheap GL call.
      */}
      <Stars
        radius={r * 6}
        depth={r * 2}
        count={5000}
        factor={5}
        saturation={0}
        fade
        speed={0.6}
      />

      {}
      <mesh ref={moonRef} position={moonPos} frustumCulled={false}>
        <sphereGeometry args={[60, 16, 12]} />
        <meshBasicMaterial
          color={isNight ? '#f0f4ff' : '#c8d0e8'}
          transparent
          opacity={isNight ? 1.0 : 0.6}
        />
      </mesh>

      {!isNight && (
        <mesh position={sunPos} frustumCulled={false} renderOrder={-1}>
          <sphereGeometry args={[isTwilight ? 75 : 55, 24, 18]} />
          <meshBasicMaterial
            color={
              dayStrength < 0.18 ? '#ff8c4a' :
              dayStrength < 0.40 ? '#ffc580' :
                                   '#fff6d8'
            }
            transparent
            opacity={1.0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {!isNight && (
        <mesh position={sunPos} frustumCulled={false} renderOrder={-2}>
          <sphereGeometry args={[isTwilight ? 220 : 150, 24, 16]} />
          <meshBasicMaterial
            color={
              dayStrength < 0.18 ? '#ff6a30' :
              dayStrength < 0.40 ? '#ffb068' :
                                   '#fff0c0'
            }
            transparent
            opacity={isTwilight ? 0.55 : 0.28}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {!isNight && (
        <mesh position={sunPos} frustumCulled={false} renderOrder={-3}>
          <sphereGeometry args={[isTwilight ? 520 : 320, 16, 12]} />
          <meshBasicMaterial
            color={
              dayStrength < 0.18 ? '#ff5020' :
              dayStrength < 0.40 ? '#ff9050' :
                                   '#ffe8a0'
            }
            transparent
            opacity={isTwilight ? 0.22 : 0.10}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {!isNight && (
        <directionalLight
          position={sunPos}
          intensity={(0.45 + dayStrength * 1.10) * stormFactor}
          color={
            weatherKind === 'storm' ? '#8a98b8' :
            dayStrength < 0.15      ? '#ff8c4a' :
            dayStrength < 0.35      ? '#ffb878' :
                                      '#fff4dc'
          }
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.00025}
          shadow-normalBias={0.04}
          shadow-camera-left={-300}
          shadow-camera-right={300}
          shadow-camera-top={300}
          shadow-camera-bottom={-300}
          shadow-camera-near={1}
          shadow-camera-far={3000}
        />
      )}

      {}
      {isNight && (
        <directionalLight
          position={moonPos}
          intensity={0.6 * stormFactor}
          color="#a8b8e0"
        />
      )}

      <ambientLight
        intensity={isNight ? 0.45 : 0.35 + dayStrength * 0.35}
        color={isNight ? '#5a6890' : '#ffffff'}
      />

      <hemisphereLight
        args={[
          isNight ? '#4a5878' : '#9bb8e0',
          isNight ? '#1a2030' : '#3d5e3d',
          (isNight ? 0.3 : 0.4 + dayStrength * 0.2) * stormFactor,
        ]}
      />

      <primitive
        attach="fog"
        object={new FogExp2(
          weatherKind === 'storm' ? '#525d70' :
          weatherKind === 'rain'  ? '#7e8a9a' :
          isNight                 ? '#0a0e1c' :
          isTwilight              ? '#d8a070' :
                                    '#a8c4e0',
          weatherKind === 'storm' ? 0.0024 :
          weatherKind === 'rain'  ? 0.0014 :
          isNight                 ? 0.0009 :
                                    0.0006,
        )}
      />
    </>
  )
}
