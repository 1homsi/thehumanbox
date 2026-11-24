let lastTick = -1
let lastAt = 0
let rate = 0

export const RACING_TICKS_PER_SECOND = 80

export const RACING_FRAME_MS = 250

export function worldPace(tick: number, now: number): number {
  if (tick !== lastTick) {
    rate = lastTick >= 0 && tick > lastTick && now > lastAt ? ((tick - lastTick) * 1000) / (now - lastAt) : 0
    lastTick = tick
    lastAt = now
  } else if (now - lastAt > 1500) {
    rate = 0
  }
  return rate
}

export function isRacing(tick: number, now: number): boolean {
  return worldPace(tick, now) > RACING_TICKS_PER_SECOND
}

export function racingNow(): boolean {
  return rate > RACING_TICKS_PER_SECOND
}

export function resetWorldPace(): void {
  lastTick = -1
  lastAt = 0
  rate = 0
}
