import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

interface Props {
  scene:       THREE.Object3D
  animations:  THREE.AnimationClip[]
  position:    [number, number, number]
  rotationY?:  number
  scale?:      number
  animation:   string            // clip name to play
  fadeMs?:     number            // cross-fade duration
  color?:      string            // optional tint (applied to all meshes)
}

// One animated instance of a GLTF scene. Each <AnimatedFigure /> gets
// its own clone (skeleton-preserving) + its own AnimationMixer, so
// dozens can share the loaded scene without sharing state.
//
// Cost: ~0.3-0.6ms per instance per frame for the mixer + a draw call
// per skinned mesh. Caller is expected to cap N (e.g. only the N
// closest orgs).
export function AnimatedFigure({
  scene, animations, position, rotationY = 0, scale = 1,
  animation, fadeMs = 200, color,
}: Props) {
  const ref = useRef<THREE.Group>(null)

  // Deep clone with skeleton/skinnedmesh bindings preserved.
  const clonedScene = useMemo(() => {
    const c = cloneSkeleton(scene)
    if (color) {
      const col = new THREE.Color(color)
      c.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (m && 'color' in m && m.color) {
          // Clone material so per-instance color doesn't bleed across.
          const cloned = m.clone()
          cloned.color = col
          ;(o as THREE.Mesh).material = cloned
        }
      })
    }
    return c
  }, [scene, color])

  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene])

  useEffect(() => {
    const clip = animations.find(a => a.name === animation)
    if (!clip) return
    const action = mixer.clipAction(clip)
    action.reset().fadeIn(fadeMs / 1000).play()
    return () => { action.fadeOut(fadeMs / 1000); action.stop() }
  }, [mixer, animations, animation, fadeMs])

  useFrame((_, dt) => mixer.update(dt))

  return (
    <group
      ref={ref}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={[scale, scale, scale]}
    >
      <primitive object={clonedScene} />
    </group>
  )
}
