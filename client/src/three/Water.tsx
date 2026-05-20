import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, MeshStandardMaterial, PlaneGeometry } from 'three'
import type { WebGLProgramParametersWithUniforms } from 'three'
import { TILE_SCALE, OCEAN_EXTENT } from './constants'

interface Props {
  width:    number
  height:   number
  depthMap?: number[][]
}

const SUB_X = 96
const SUB_Y = 48

export function Water({ width, height, depthMap }: Props) {
  const outerMatRef = useRef<MeshStandardMaterial>(null)
  const innerMatRef = useRef<MeshStandardMaterial>(null)
  // Drives the time uniform that the patched vertex shader reads
  // from. Frame-by-frame buffer uploads from CPU sine-wave displacement
  // gone — the GPU now computes the wave per vertex per draw.
  const waveTimeRef = useRef({ value: 0 })

  const cx = width  * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5

  const PLANE_W = width  * TILE_SCALE
  const PLANE_H = height * TILE_SCALE

  // Build the inner plane geometry once. Land mask becomes a vertex
  // attribute the shader can read to skip displacement on land tiles.
  const innerGeo = useMemo(() => {
    const geo = new PlaneGeometry(PLANE_W, PLANE_H, SUB_X, SUB_Y)
    const pos = geo.attributes.position as BufferAttribute
    const mask = new Float32Array(pos.count)
    if (depthMap && depthMap.length) {
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i)
        const ly = pos.getY(i)
        const col = Math.floor((lx + PLANE_W / 2) / TILE_SCALE)
        const row = Math.floor((ly + PLANE_H / 2) / TILE_SCALE)
        const d = depthMap[Math.max(0, Math.min(height - 1, row))]
                          ?.[Math.max(0, Math.min(width - 1, col))]
                  ?? 255
        const isLand = d >= 254
        mask[i] = isLand ? 1 : 0
        if (isLand) {
          pos.setZ(i, -3.0)
        }
      }
      pos.needsUpdate = true
    } else {
      mask.fill(0)
    }
    geo.setAttribute('aLand', new BufferAttribute(mask, 1))
    const normals = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      normals[i * 3]     = 0
      normals[i * 3 + 1] = 0
      normals[i * 3 + 2] = 1
    }
    geo.setAttribute('normal', new BufferAttribute(normals, 3))
    return geo
  }, [PLANE_W, PLANE_H, width, height, depthMap])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    waveTimeRef.current.value = t
    if (outerMatRef.current) {
      const s = Math.sin(t * 0.4) * 0.04
      outerMatRef.current.color.setRGB(0.16 + s, 0.32 + s * 0.5, 0.5)
    }
  })

  // Hook the material's onBeforeCompile to inject the wave displacement
  // into the vertex shader. This runs once per material; per-frame we
  // only need to update the `uWaveTime` uniform.
  const onBeforeCompileInner = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uWaveTime = waveTimeRef.current
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aLand;
         uniform float uWaveTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         if (aLand < 0.5) {
           float wave = sin(position.x * 0.04 + uWaveTime * 0.7) * 0.12
                      + cos(position.y * 0.05 + uWaveTime * 0.55) * 0.08
                      + sin((position.x + position.y) * 0.02 + uWaveTime * 0.3) * 0.05;
           transformed.z += wave;
         }`,
      )
  }

  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[cx, -0.6, cz]}
        receiveShadow
        frustumCulled={false}
      >
        <planeGeometry args={[OCEAN_EXTENT * 2, OCEAN_EXTENT * 2, 1, 1]} />
        <meshStandardMaterial
          ref={outerMatRef}
          color="#1f4870"
          transparent
          opacity={0.95}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      <mesh
        rotation-x={-Math.PI / 2}
        position={[cx, -0.05, cz]}
        receiveShadow
        geometry={innerGeo}
        frustumCulled={false}
      >
        <meshStandardMaterial
          ref={innerMatRef}
          color="#3a78ac"
          transparent
          opacity={0.82}
          roughness={0.18}
          metalness={0.15}
          onBeforeCompile={onBeforeCompileInner}
        />
      </mesh>
    </>
  )
}
