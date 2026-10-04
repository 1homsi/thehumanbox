export const DAY_LENGTH = 600

export function fmt(ticks: number) {
  const days = Math.floor(ticks / DAY_LENGTH)
  return days === 1 ? '1 day' : `${days} days`
}
