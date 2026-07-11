import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, Mesh, PlaneGeometry } from 'three'
import { TILE_SCALE } from './constants'

interface Props {
  isNight: boolean
  season: string | undefined
  width: number
  height: number
}

const CURTAINS = 3
const SEG_X = 48
const SEG_Y = 14
const GREEN = [0.33, 0.95, 0.62]
const PURPLE = [0.6, 0.42, 0.95]

export function Aurora({ isNight, season, width, height }: Props) {
  const visible = isNight && (season === 'scarcity' || season === 'recovery')
  const span = Math.max(width, height) * TILE_SCALE
  const cx = (width * TILE_SCALE) / 2
  const cz = (height * TILE_SCALE) / 2

  const refs = useRef<Array<Mesh | null>>(Array(CURTAINS).fill(null))

  const geos = useMemo(
    () =>
      Array.from({ length: CURTAINS }, (_, i) => {
        const w = span * (0.72 - i * 0.1)
        const h = span * (0.2 + i * 0.03)
        const g = new PlaneGeometry(w, h, SEG_X, SEG_Y)
        const pos = g.attributes.position
        const colors = new Float32Array(pos.count * 4)
        for (let v = 0; v < pos.count; v++) {
          const ty = pos.getY(v) / h + 0.5
          const tx = pos.getX(v) / w + 0.5
          const mix = Math.min(1, Math.max(0, (ty - 0.35) * 1.8))
          colors[v * 4] = GREEN[0] + (PURPLE[0] - GREEN[0]) * mix
          colors[v * 4 + 1] = GREEN[1] + (PURPLE[1] - GREEN[1]) * mix
          colors[v * 4 + 2] = GREEN[2] + (PURPLE[2] - GREEN[2]) * mix
          const sideFade = Math.pow(Math.sin(Math.PI * tx), 1.6)
          const bottomFade = Math.min(1, ty / 0.14)
          colors[v * 4 + 3] = Math.pow(1 - ty, 1.9) * 0.55 * sideFade * bottomFade
        }
        g.setAttribute('color', new BufferAttribute(colors, 4))
        return g
      }),
    [span],
  )

  useEffect(
    () => () => {
      for (const g of geos) g.dispose()
    },
    [geos],
  )

  useFrame(({ clock }) => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (!visible) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i]
      if (!m) continue
      const pos = geos[i].attributes.position as BufferAttribute
      const speed = 0.42 + i * 0.14
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v)
        pos.setZ(v, Math.sin(x * 0.016 + t * speed + i * 2.1) * 8 + Math.sin(x * 0.045 - t * 0.3 + i) * 3.5)
      }
      pos.needsUpdate = true
      const drift = Math.sin(t * 0.1 + i * 2.4) * span * 0.08
      m.position.setX(cx + drift)
      const mat = m.material as { opacity: number }
      mat.opacity = 0.34 + Math.sin(t * 0.45 + i * 0.9) * 0.12
    }
  })

  if (!visible) return null

  return (
    <>
      {geos.map((g, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          geometry={g}
          position={[cx, span * 0.26 + span * (0.2 + i * 0.03) * 0.5, cz - span * 0.6 - i * 20]}
          rotation={[0, (i - 1) * 0.24, 0]}
          frustumCulled={false}
          renderOrder={-3}
        >
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.34}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  )
}
