import * as THREE from 'three'

export const windUniforms = {
  uTime:     { value: 0 },
  uStrength: { value: 0.22 },
}

export function applyWindSway(
  mat: THREE.Material,
  heightRef = 2.5,
  strength  = 1.0,
) {
  const origCompile = mat.onBeforeCompile?.bind(mat)
  mat.onBeforeCompile = (shader, renderer) => {
    if (origCompile) origCompile(shader, renderer)
    shader.uniforms.uTime     = windUniforms.uTime
    shader.uniforms.uStrength = windUniforms.uStrength
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uStrength;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        `
         vec3 transformed = vec3( position );
         #ifdef USE_INSTANCING
           float ipx = instanceMatrix[3].x;
           float ipz = instanceMatrix[3].z;
           float phase = ipx * 0.13 + ipz * 0.17;
           float h = clamp(position.y / ${heightRef.toFixed(2)}, 0.0, 1.0);
           float k = uStrength * ${strength.toFixed(2)};
           transformed.x += sin(uTime * 1.4 + phase) * k * h;
           transformed.z += cos(uTime * 1.2 + phase * 0.9) * k * 0.5 * h;
         #endif
        `,
      )
  }
  mat.needsUpdate = true
  return mat
}
