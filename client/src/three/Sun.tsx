import { useMemo, useRef } from 'react'
import { Sky, Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  dayProgress: number  // 0..1 — 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  width:  number
  height: number
}

// Day/night cycle. Sun follows a real arc east -> overhead -> west,
// going BELOW the world plane at night. drei Sky renders bright/dim
// based on sun elevation; we crossfade in stars + a moon when the
// sun goes under the horizon.
export function Sun({ dayProgress, width, height }: Props) {
  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5
  const r  = Math.max(width, height) * TILE_SCALE * 1.2
  // Sun position: altitude follows sin((p-0.25)*2π) so it's at
  //   p=0.25 (sunrise): horizon
  //   p=0.5  (noon):    peak
  //   p=0.75 (sunset):  horizon
  //   p=0/1  (midnight): -peak (below ground)
  const dawn = (dayProgress - 0.25) * 2 * Math.PI
  const sunAlt = Math.sin(dawn)
  const sunAz  = Math.cos(dawn)
  const sunPos = useMemo<[number, number, number]>(() => [
    cx - sunAz * r,
    sunAlt * r * 0.8,
    cz,
  ], [cx, cz, r, sunAz, sunAlt])

  // Day strength: 1 at noon, 0 at sunrise/sunset, negative at night.
  const dayStrength = Math.max(0, sunAlt)
  const isNight = sunAlt < 0
  const isTwilight = !isNight && dayStrength < 0.25

  // Moon: opposite side of the sky from sun, so when sun is down,
  // moon is up. Positioned at sun's antipode so the two never
  // collide.
  const moonPos = useMemo<[number, number, number]>(() => [
    cx + sunAz * r * 0.8,
    -sunAlt * r * 0.8,
    cz,
  ], [cx, cz, r, sunAz, sunAlt])
  const moonRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!moonRef.current) return
    // Subtle pulse to keep the moon feeling like a light, not a sticker.
    const t = clock.getElapsedTime()
    const s = 1 + Math.sin(t * 0.5) * 0.02
    moonRef.current.scale.set(s, s, s)
  })

  // Sky params: lerp turbidity/rayleigh from day -> twilight -> night
  // so the transition is continuous (no wedge bug).
  // Day: turbidity ~4, rayleigh ~2 (bright blue).
  // Twilight: turbidity ~6, rayleigh ~4 (warm orange).
  // Night: skip the Sky shader and use a deep blue background.
  const skyTurbidity = isTwilight ? 6 : 4
  const skyRayleigh  = isTwilight ? 3.5 : 2

  return (
    <>
      {/* Solid background that's always visible. Color crossfades
          day/twilight/night so the sky never "ends" abruptly. */}
      <color
        attach="background"
        args={[
          new THREE.Color().setRGB(
            // Slightly warm at twilight, cool/blue at night, bright
            // sky-blue at day.
            isNight ? 0.04 : dayStrength * 0.45 + 0.18,
            isNight ? 0.06 : dayStrength * 0.55 + 0.22,
            isNight ? 0.12 : dayStrength * 0.55 + 0.42,
          ).getHex(),
        ]}
      />

      {/* Procedural sky atmosphere - only when sun is above horizon.
          Skipping at night avoids the wedge / shader artefacts that
          appear when sun is below the rendering plane. */}
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

      {/* Stars - always present in the sky sphere, faded by daylight.
          drei's Stars renders far away and self-rotates slowly. */}
      <Stars
        radius={r * 6}
        depth={r * 2}
        count={isNight ? 5000 : 800}
        factor={isNight ? 5 : 2}
        saturation={0}
        fade
        speed={isNight ? 0.6 : 0.1}
      />

      {/* Moon - a small bright sphere positioned opposite the sun.
          Visible during day too (subtle) and pronounced at night. */}
      <mesh ref={moonRef} position={moonPos} frustumCulled={false}>
        <sphereGeometry args={[60, 16, 12]} />
        <meshBasicMaterial
          color={isNight ? '#f0f4ff' : '#c8d0e8'}
          transparent
          opacity={isNight ? 1.0 : 0.6}
        />
      </mesh>

      {/* Sun visible disc at twilight for a warm sunrise/sunset feel.
          Subtle - drei Sky already paints the sun position. */}
      {isTwilight && (
        <mesh position={sunPos} frustumCulled={false}>
          <sphereGeometry args={[80, 12, 10]} />
          <meshBasicMaterial color="#ffd095" transparent opacity={0.5} />
        </mesh>
      )}

      {/* Sun light (above horizon only) - warm and bright. */}
      {!isNight && (
        <directionalLight
          position={sunPos}
          intensity={0.4 + dayStrength * 1.0}
          color={dayStrength < 0.2 ? '#ffb070' : '#fff6e0'}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-300}
          shadow-camera-right={300}
          shadow-camera-top={300}
          shadow-camera-bottom={-300}
          shadow-camera-near={1}
          shadow-camera-far={3000}
        />
      )}

      {/* Moon light - dim cool light at night so the world is still
          navigable instead of pitch black. */}
      {isNight && (
        <directionalLight
          position={moonPos}
          intensity={0.6}
          color="#a8b8e0"
        />
      )}

      {/* Ambient. Bright enough that nothing is ever a black silhouette,
          even at midnight. Day boosts it further; night drops to a
          cool floor. */}
      <ambientLight
        intensity={isNight ? 0.45 : 0.35 + dayStrength * 0.35}
        color={isNight ? '#5a6890' : '#ffffff'}
      />

      {/* Hemisphere light: brighter from the sky direction, dimmer
          from below. Adds shading naturalism cheaply. */}
      <hemisphereLight
        args={[
          isNight ? '#4a5878' : '#9bb8e0',
          isNight ? '#1a2030' : '#3d5e3d',
          isNight ? 0.3 : 0.4 + dayStrength * 0.2,
        ]}
      />
    </>
  )
}
