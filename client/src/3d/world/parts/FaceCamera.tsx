import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'

interface Props {
  position?: [number, number, number]
  children: ReactNode
}

export function FaceCamera({ position, children }: Props) {
  const ref = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (ref.current) camera.getWorldQuaternion(ref.current.quaternion)
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}
