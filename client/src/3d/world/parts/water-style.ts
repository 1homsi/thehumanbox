export function waterColorAt(progress: number): [number, number, number] {
  progress = ((progress % 1) + 1) % 1
  // Inner water surface colour through the day. Matches the SceneFog ramp.
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [0.08, 0.1, 0.24]],
    [0.12, [0.32, 0.46, 0.62]],
    [0.25, [0.18, 0.52, 0.7]],
    [0.5, [0.13, 0.55, 0.76]],
    [0.7, [0.2, 0.52, 0.72]],
    [0.82, [0.36, 0.36, 0.5]],
    [0.92, [0.14, 0.18, 0.32]],
    [1.0, [0.08, 0.1, 0.24]],
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
  return [
    lo[1][0] + (hi[1][0] - lo[1][0]) * t,
    lo[1][1] + (hi[1][1] - lo[1][1]) * t,
    lo[1][2] + (hi[1][2] - lo[1][2]) * t,
  ]
}

// PlaneGeometry local +Y maps to world -Z after the -PI/2 rotation.
export function waterTileAt(
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
): [number, number] {
  return [
    Math.max(0, Math.min(width - 1, Math.floor(x / scale + width / 2))),
    Math.max(0, Math.min(height - 1, Math.floor(height / 2 - y / scale))),
  ]
}
