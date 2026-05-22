import { useFrame, useThree } from '@react-three/fiber'

interface Props {
  dayProgress: number
  weatherKind?: string
}

export function CinematicGrade({ dayProgress, weatherKind = 'clear' }: Props) {
  const { gl } = useThree()

  useFrame(() => {
    const sunAlt = Math.sin((dayProgress - 0.25) * 2 * Math.PI)
    const dayStrength = Math.max(0, sunAlt)
    const isNight = sunAlt < 0
    const goldenHour = !isNight && dayStrength < 0.35
    let exposure: number
    if (isNight) exposure = 0.85
    else if (goldenHour) exposure = 1.22
    else exposure = 0.95 + dayStrength * 0.2
    if (weatherKind === 'storm') exposure *= 0.78
    else if (weatherKind === 'rain') exposure *= 0.88
    const current = gl.toneMappingExposure
    gl.toneMappingExposure = current + (exposure - current) * 0.05
  })

  return null
}
