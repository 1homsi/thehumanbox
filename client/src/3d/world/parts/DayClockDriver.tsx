import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { advanceDayClock, setDayProgressTarget } from './day-clock'

interface Props {
  target: number
  onTick: (smoothed: number) => void
  publishMs?: number
}

export function DayClockDriver({ target, onTick, publishMs = 120 }: Props) {
  const lastPublishAt = useRef(0)

  useEffect(() => {
    setDayProgressTarget(target)
  }, [target])

  useFrame((_, delta) => {
    const smoothed = advanceDayClock(delta)
    const now = performance.now()
    if (now - lastPublishAt.current >= publishMs) {
      lastPublishAt.current = now
      onTick(smoothed)
    }
  })

  return null
}
