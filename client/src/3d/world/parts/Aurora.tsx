import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PlaneGeometry, Mesh, Color, AdditiveBlending, DoubleSide } from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  isNight: boolean
  season: string | undefined
  width: number
  height: number
}

const BAND_COUNT = 4

export function Aurora({ isNight, season, width, height }: Props) {
  const visible = isNight && (season === 'scarcity' || season === 'recovery')
  const cx = (width * TILE_SCALE) / 2
  const cz = (height * TILE_SCALE) / 2
  const skyR = Math.max(width, height) * TILE_SCALE * 0.55
  const skyY = Math.max(width, height) * TILE_SCALE * 0.7

  const refs = useRef<Array<Mesh | null>>(Array(BAND_COUNT).fill(null))
  const geo = useMemo(() => new PlaneGeometry(skyR * 1.6, skyR * 0.45, 24, 1), [skyR])
  const tintA = useMemo(() => new Color('#5cf2a4'), [])
  const tintB = useMemo(() => new Color('#9b6df2'), [])

  useFrame(({ clock }) => {
    if (!visible) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i]
      if (!m) continue
      const wobble = Math.sin(t * 0.35 + i * 1.7) * 0.5 + Math.sin(t * 0.18 + i * 0.7) * 0.35
      m.rotation.z = wobble * 0.3
      const drift = Math.sin(t * 0.12 + i * 2.1) * skyR * 0.15
      m.position.set(cx + drift, skyY + i * 28, cz - skyR * 0.4 - i * 18)
      const mat = m.material as { opacity: number }
      mat.opacity = 0.18 + Math.abs(Math.sin(t * 0.5 + i * 0.9)) * 0.22
    }
  })

  if (!visible) return null

  return (
    <>
      {Array.from({ length: BAND_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          geometry={geo}
          rotation={[-Math.PI / 2.1, 0, 0]}
          frustumCulled={false}
          renderOrder={-3}
        >
          <meshBasicMaterial
            color={i % 2 === 0 ? tintA : tintB}
            transparent
            opacity={0.2}
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  )
}
