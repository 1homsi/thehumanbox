export const dayClock = {
  current: 0.3,
  target: 0.3,
  lastUpdateAt: 0,
}

export function setDayProgressTarget(next: number): void {
  if (Math.abs(next - dayClock.target) < 1e-6) return
  dayClock.target = next
  dayClock.lastUpdateAt = performance.now()
}

export function advanceDayClock(deltaSec: number): number {
  const span = dayClock.target - dayClock.current
  const abs = Math.abs(span)
  if (abs < 1e-5) {
    dayClock.current = dayClock.target
    return dayClock.current
  }
  if (abs > 0.5) {
    dayClock.current = dayClock.target
    return dayClock.current
  }
  const followRate = 4.0
  const step = span * Math.min(1, deltaSec * followRate)
  dayClock.current += step
  return dayClock.current
}
