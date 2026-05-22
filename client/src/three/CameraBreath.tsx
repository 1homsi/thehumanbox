import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { cameraCommand } from './camera-state'

interface Props {
  enabled?: boolean
}

export function CameraBreath({ enabled = true }: Props) {
  const { camera } = useThree()
  const phase = useRef(Math.random() * Math.PI * 2)
  const lastApplied = useRef({ x: 0, y: 0 })

  useEffect(() => {
    lastApplied.current = { x: 0, y: 0 }
  }, [])

  useFrame((_, delta) => {
    if (!enabled) return
    if (cameraCommand.followOrgId) return
    phase.current += delta
    const yBob  = Math.sin(phase.current * 0.55) * 0.06
    const xSway = Math.sin(phase.current * 0.32 + 1.3) * 0.04
    camera.position.x += xSway - lastApplied.current.x
    camera.position.y += yBob  - lastApplied.current.y
    lastApplied.current = { x: xSway, y: yBob }
  })

  return null
}
