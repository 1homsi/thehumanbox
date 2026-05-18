import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

interface Props {
  scene:       THREE.Object3D
  animations:  THREE.AnimationClip[]
  position?:   [number, number, number]
  getPosition?: () => [number, number, number]
  getHeading?: () => number
  rotationY?:  number
  scale?:      number
  animation:   string
  fadeMs?:     number
  color?:      string
  animate?:    boolean
  timeScale?:  number
}

export function AnimatedFigure({
  scene, animations, position, getPosition, getHeading,
  rotationY = 0, scale = 1, animation, fadeMs = 200, color, animate = true,
  timeScale = 1,
}: Props) {
  const ref = useRef<THREE.Group>(null)

  const clonedScene = useMemo(() => {
    const c = cloneSkeleton(scene)
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
        ref.current.rotation.y = getHeading()
      } else {
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
