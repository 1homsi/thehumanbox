import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, Mesh, ShaderMaterial, Vector3 } from 'three'
import type { WildernessPalette } from './wilderness-palette'

interface Props {
  palette: WildernessPalette
  sunDirection: [number, number, number]
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  varying vec3 vWorldDirection;

  void main() {
    vec3 direction = normalize(vWorldDirection);
    float elevation = clamp(direction.y, 0.0, 1.0);
    float midBand = smoothstep(0.02, 0.42, elevation);
    float topBand = smoothstep(0.38, 0.92, elevation);
    vec3 sky = mix(uHorizon, uMid, midBand);
    sky = mix(sky, uTop, topBand);

    float horizonHaze = exp(-abs(direction.y) * 12.0);
    sky = mix(sky, uHorizon, horizonHaze * 0.22);

    float facingSun = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunHalo = pow(facingSun, 18.0) * 0.34 + pow(facingSun, 80.0) * 0.2;
    sky += uSunColor * sunHalo;

    gl_FragColor = vec4(sky, 1.0);
  }
`

export function PosterSky({ palette, sunDirection }: Props) {
  const meshRef = useRef<Mesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTop: { value: new Color() },
          uMid: { value: new Color() },
          uHorizon: { value: new Color() },
          uSunDirection: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color() },
        },
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  material.uniforms.uTop.value.set(palette.skyTop)
  material.uniforms.uMid.value.set(palette.skyMid)
  material.uniforms.uHorizon.value.set(palette.skyHorizon)
  material.uniforms.uSunDirection.value.set(...sunDirection).normalize()
  material.uniforms.uSunColor.value.set(palette.sun)

  useFrame(({ camera }) => {
    meshRef.current?.position.copy(camera.position)
  })

  return (
    <mesh ref={meshRef} material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[1800, 32, 18]} />
    </mesh>
  )
}
