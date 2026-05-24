import { useMemo } from 'react'
import { Color, FogExp2 } from 'three'

interface Props {
  dayProgress: number
}

// Day-night fog colour ramp. Warm dawn → soft blue noon → amber dusk → deep blue night.
function fogColorAt(progress: number): Color {
  // progress: 0..1 across the full day. Roughly:
  //   0.0  → dawn (warm pink)
  //   0.25 → mid-morning (light blue-grey)
  //   0.5  → noon (pale blue)
  //   0.75 → dusk (amber)
  //   1.0 → night (deep navy)
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [0.86, 0.78, 0.78]],
    [0.12, [0.92, 0.86, 0.78]],
    [0.25, [0.84, 0.86, 0.88]],
    [0.5, [0.78, 0.84, 0.9]],
    [0.7, [0.84, 0.74, 0.6]],
    [0.82, [0.72, 0.5, 0.42]],
    [0.92, [0.25, 0.27, 0.36]],
    [1.0, [0.14, 0.16, 0.26]],
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (progress >= stops[i][0] && progress <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0]
  const t = span === 0 ? 0 : (progress - lo[0]) / span
  const r = lo[1][0] + (hi[1][0] - lo[1][0]) * t
  const g = lo[1][1] + (hi[1][1] - lo[1][1]) * t
  const b = lo[1][2] + (hi[1][2] - lo[1][2]) * t
  return new Color(r, g, b)
}

export function SceneFog({ dayProgress }: Props) {
  const fog = useMemo(() => {
    const color = fogColorAt(dayProgress)
    // Density tuned so distant terrain reads soft but the close foreground
    // stays crisp. Night gets a touch denser to feel oppressive.
    const isNight = dayProgress > 0.85 || dayProgress < 0.05
    const density = isNight ? 0.0034 : 0.0022
    return new FogExp2(color, density)
  }, [dayProgress])

  return <primitive object={fog} attach="fog" />
}
