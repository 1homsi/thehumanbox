import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

interface Props {
  scene:       THREE.Object3D
  animations:  THREE.AnimationClip[]
  // Either a static position or a getter that's polled every frame
  // for smooth WS-tick interpolation. Pass `getPosition` for live
  // orgs/animals so they tween instead of teleporting per tick.
  position?:   [number, number, number]
  getPosition?: () => [number, number, number]
  // Optional predicted heading getter. If provided, overrides the
  // derived-from-position heading - useful when the caller has a
  // smoothed prediction model (client-side prediction in
  // motion-state.ts) that should drive yaw directly.
  getHeading?: () => number
  rotationY?:  number
  scale?:      number
  animation:   string
  fadeMs?:     number
  color?:      string
  // When false, skip the mixer.update call - the figure renders in
  // its current pose but its limbs stop animating. Lets us put a
  // robot on every org without running 200 skeletal animations.
  animate?:    boolean
  // Multiplier on the AnimationMixer's clock speed. Pass 1.5 to
  // play the walk cycle 50% faster (e.g. for sprinting orgs).
  timeScale?:  number
}

// One animated instance of a GLTF scene. Each <AnimatedFigure /> gets
// its own clone (skeleton-preserving) + its own AnimationMixer, so
// dozens can share the loaded scene without sharing state.
//
// Cost: ~0.3-0.6ms per instance per frame for the mixer + a draw call
// per skinned mesh. Caller is expected to cap N (e.g. only the N
// closest orgs).
export function AnimatedFigure({
  scene, animations, position, getPosition, getHeading,
  rotationY = 0, scale = 1, animation, fadeMs = 200, color, animate = true,
  timeScale = 1,
}: Props) {
  const ref = useRef<THREE.Group>(null)

  // Deep clone with skeleton/skinnedmesh bindings preserved.
  const clonedScene = useMemo(() => {
    const c = cloneSkeleton(scene)
    // Disable frustum culling so figures don't pop in/out when their
    // bounding box center leaves the camera frustum (was causing
    // visible figures to disappear when the camera turned slightly).
    c.traverse(o => {
      o.frustumCulled = false
    })
    if (color) {
      const col = new THREE.Color(color)
      c.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (m && 'color' in m && m.color) {
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

  useFrame((_, dt) => {
    if (animate) mixer.update(dt * timeScale)
    if (getPosition && ref.current) {
      const [x, y, z] = getPosition()
      ref.current.position.set(x, y, z)
      if (getHeading) {
        // Caller supplies a smoothed predicted heading (from the
        // client-side prediction model). Use it directly so the
        // character starts turning toward its destination before
        // visible movement.
        ref.current.rotation.y = getHeading()
      } else {
        // Fallback: derive heading from successive position samples.
        const lastX = (ref.current as THREE.Group & { _lastX?: number })._lastX
        const lastZ = (ref.current as THREE.Group & { _lastZ?: number })._lastZ
        if (lastX != null && lastZ != null) {
          const dx = x - lastX
          const dz = z - lastZ
          if (dx * dx + dz * dz > 0.001) {
            ref.current.rotation.y = Math.atan2(dx, dz)
          }
        }
        ;(ref.current as THREE.Group & { _lastX?: number })._lastX = x
        ;(ref.current as THREE.Group & { _lastZ?: number })._lastZ = z
      }
    }
  })

  return (
    <group
      ref={ref}
      position={position ?? [0, 0, 0]}
      rotation={[0, rotationY, 0]}
      scale={[scale, scale, scale]}
    >
      <primitive object={clonedScene} />
    </group>
  )
}
