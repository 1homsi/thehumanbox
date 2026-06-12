import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, MeshStandardMaterial, PlaneGeometry } from 'three'
import type { WebGLProgramParametersWithUniforms } from 'three'
import { TILE_SCALE, OCEAN_EXTENT } from './constants'

interface Props {
  width: number
  height: number
  depthMap?: number[][]
  dayProgress?: number
}

function waterColorAt(progress: number): [number, number, number] {
  // Inner water surface colour through the day. Matches the SceneFog ramp.
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [0.32, 0.34, 0.5]],
    [0.12, [0.36, 0.42, 0.58]],
    [0.25, [0.34, 0.5, 0.62]],
    [0.5, [0.28, 0.52, 0.66]],
    [0.7, [0.35, 0.45, 0.6]],
    [0.82, [0.38, 0.34, 0.46]],
    [0.92, [0.14, 0.18, 0.32]],
    [1.0, [0.08, 0.1, 0.24]],
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (progress >= stops[i][0] && progress <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0]
  const t = span === 0 ? 0 : (progress - lo[0]) / span
  return [
    lo[1][0] + (hi[1][0] - lo[1][0]) * t,
    lo[1][1] + (hi[1][1] - lo[1][1]) * t,
    lo[1][2] + (hi[1][2] - lo[1][2]) * t,
  ]
}

const SUB_X = 160
const SUB_Y = 80

export function Water({ width, height, depthMap, dayProgress = 0.5 }: Props) {
  const outerMatRef = useRef<MeshStandardMaterial>(null)
  const innerMatRef = useRef<MeshStandardMaterial>(null)
  // Drives the time uniform that the patched vertex shader reads
  // from. Frame-by-frame buffer uploads from CPU sine-wave displacement
  // gone - the GPU now computes the wave per vertex per draw.
  const waveTimeRef = useRef({ value: 0 })

  const cx = width * TILE_SCALE * 0.5
  const cz = height * TILE_SCALE * 0.5

  const PLANE_W = width * TILE_SCALE
  const PLANE_H = height * TILE_SCALE

  // Build the inner plane geometry once. Land mask becomes a vertex
  // attribute the shader can read to skip displacement on land tiles.
  const innerGeo = useMemo(() => {
    const geo = new PlaneGeometry(PLANE_W, PLANE_H, SUB_X, SUB_Y)
    const pos = geo.attributes.position as BufferAttribute
    const mask = new Float32Array(pos.count)
    const shore = new Float32Array(pos.count)
    if (depthMap && depthMap.length) {
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i)
        const ly = pos.getY(i)
        const col = Math.max(0, Math.min(width - 1, Math.floor((lx + PLANE_W / 2) / TILE_SCALE)))
        const row = Math.max(0, Math.min(height - 1, Math.floor((ly + PLANE_H / 2) / TILE_SCALE)))
        const d = depthMap[row]?.[col] ?? 255
        const isLand = d >= 254
        mask[i] = isLand ? 1 : 0
        if (isLand) {
          pos.setZ(i, -3.0)
        } else {
          let nearLand = false
          for (let dy = -1; dy <= 1 && !nearLand; dy++) {
            for (let dx = -1; dx <= 1 && !nearLand; dx++) {
              const nd = depthMap[row + dy]?.[col + dx] ?? 255
              if (nd >= 254) nearLand = true
            }
          }
          const shallow = Math.max(0, Math.min(1, (d - 150) / 50))
          shore[i] = nearLand ? 1 : shallow * 0.45
        }
      }
      pos.needsUpdate = true
    } else {
      mask.fill(0)
    }
    geo.setAttribute('aLand', new BufferAttribute(mask, 1))
    geo.setAttribute('aShore', new BufferAttribute(shore, 1))
    const normals = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      normals[i * 3] = 0
      normals[i * 3 + 1] = 0
      normals[i * 3 + 2] = 1
    }
    geo.setAttribute('normal', new BufferAttribute(normals, 3))
    return geo
  }, [PLANE_W, PLANE_H, width, height, depthMap])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    waveTimeRef.current.value = t
    const [r, g, b] = waterColorAt(dayProgress)
    // Outer ocean: darker, deeper version of the inner colour with a
    // gentle slow shimmer added on top.
    if (outerMatRef.current) {
      const s = Math.sin(t * 0.4) * 0.025
      outerMatRef.current.color.setRGB(
        Math.max(0, r * 0.55 + s),
        Math.max(0, g * 0.6 + s * 0.5),
        Math.max(0, b * 0.7 + s * 0.5),
      )
    }
    if (innerMatRef.current) {
      innerMatRef.current.color.setRGB(r, g, b)
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
         attribute float aShore;
         uniform float uWaveTime;
         varying vec2 vWavePos;
         varying float vLand;
         varying float vShore;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         if (aLand < 0.5) {
           float dwx = 0.0048 * cos(position.x * 0.04 + uWaveTime * 0.7)
                     + 0.0010 * cos((position.x + position.y) * 0.02 + uWaveTime * 0.3);
           float dwy = -0.0040 * sin(position.y * 0.05 + uWaveTime * 0.55)
                     + 0.0010 * cos((position.x + position.y) * 0.02 + uWaveTime * 0.3);
           objectNormal = normalize(vec3(-dwx * 26.0, -dwy * 26.0, 1.0));
         }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vWavePos = position.xy;
         vLand = aLand;
         vShore = aShore;
         if (aLand < 0.5) {
           float wave = sin(position.x * 0.04 + uWaveTime * 0.7) * 0.12
                      + cos(position.y * 0.05 + uWaveTime * 0.55) * 0.08
                      + sin((position.x + position.y) * 0.02 + uWaveTime * 0.3) * 0.05;
           transformed.z += wave;
         }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWaveTime;
         varying vec2 vWavePos;
         varying float vLand;
         varying float vShore;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         if (vLand < 0.5) {
           float sparkle = sin(vWavePos.x * 0.6 + uWaveTime * 1.7)
                         * cos(vWavePos.y * 0.55 + uWaveTime * 1.3);
           sparkle += sin(vWavePos.x * 0.32 - uWaveTime * 1.1)
                    * cos(vWavePos.y * 0.42 + uWaveTime * 0.9);
           sparkle = max(0.0, sparkle - 0.75) * 1.4;
           gl_FragColor.rgb += vec3(sparkle * 0.6, sparkle * 0.55, sparkle * 0.5);

           vec3 fresnelView = normalize(vViewPosition);
           float fres = pow(1.0 - clamp(dot(normal, fresnelView), 0.0, 1.0), 3.0);
           gl_FragColor.rgb += vec3(0.10, 0.13, 0.16) * fres;
           gl_FragColor.a = min(1.0, gl_FragColor.a + fres * 0.12);

           float foamBand = vShore * (0.55 + 0.45 * sin(uWaveTime * 1.5
                            + vWavePos.x * 0.45 + vWavePos.y * 0.38));
           float foamNoise = 0.5 + 0.5 * sin(vWavePos.x * 1.7 + uWaveTime * 0.8)
                                       * cos(vWavePos.y * 1.5 - uWaveTime * 0.6);
           float foam = clamp(foamBand * (0.45 + 0.55 * foamNoise), 0.0, 1.0) * 0.55;
           gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.92, 0.96, 0.98), foam);
         }`,
      )
  }

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[cx, -1.6, cz]} receiveShadow frustumCulled={false}>
        <planeGeometry args={[OCEAN_EXTENT * 2, OCEAN_EXTENT * 2, 1, 1]} />
        <meshStandardMaterial
          ref={outerMatRef}
          color="#1f4870"
          transparent
          opacity={0.95}
          roughness={0.35}
          metalness={0.1}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      <mesh
        rotation-x={-Math.PI / 2}
        position={[cx, -0.55, cz]}
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
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          onBeforeCompile={onBeforeCompileInner}
        />
      </mesh>
    </>
  )
}
