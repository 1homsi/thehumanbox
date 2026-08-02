import { useFrame, useThree } from '@react-three/fiber'
import { getWildernessPalette, type WildernessWeather } from './wilderness-palette'

interface Props {
  dayProgress: number
  weatherKind?: string
}

export function CinematicGrade({ dayProgress, weatherKind = 'clear' }: Props) {
  const { gl } = useThree()
  const palette = getWildernessPalette(dayProgress, weatherKind as WildernessWeather)

  useFrame(() => {
    const current = gl.toneMappingExposure
    gl.toneMappingExposure = current + (palette.exposure - current) * 0.05
  })

  return null
}
