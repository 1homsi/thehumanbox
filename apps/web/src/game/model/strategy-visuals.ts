export const STRATEGY_VISUALS = {
  hunt: { symbol: '⌖', label: 'hunt', color: '#e6a85c' },
  explore: { symbol: '✦', label: 'explore', color: '#70c8ff' },
  settle: { symbol: '⌂', label: 'settle', color: '#8ed081' },
  trade: { symbol: '⇄', label: 'trade', color: '#e6ca72' },
  defend: { symbol: '◆', label: 'defend', color: '#ff806d' },
} as const

export type StrategyName = keyof typeof STRATEGY_VISUALS

export interface StrategyEntry {
  strategy: string
  expires_tick: number
}

export interface ActiveStrategy {
  strategy: StrategyName
  symbol: string
  label: string
  color: string
  ticksRemaining: number
}

export function activeStrategy(entry: StrategyEntry | undefined, tick: number): ActiveStrategy | null {
  if (!entry || entry.expires_tick <= tick) return null
  if (!(entry.strategy in STRATEGY_VISUALS)) return null
  const strategy = entry.strategy as StrategyName
  return {
    strategy,
    ...STRATEGY_VISUALS[strategy],
    ticksRemaining: entry.expires_tick - tick,
  }
}

export interface StrategyBeaconPosition {
  lineageId: string
  strategy: ActiveStrategy
  x: number
  y: number
}

/** Resolve all map beacons without rescanning the population per lineage. */
export function strategyBeaconPositions(
  entries: Readonly<Record<string, StrategyEntry>> | undefined,
  tick: number,
  settlements: readonly { lineage_id: string; center: readonly [number, number] }[] | undefined,
  homes: Readonly<Record<string, readonly number[]>> | undefined,
  organisms: readonly { alive: boolean; lineage_id: string; x: number; y: number }[],
): StrategyBeaconPosition[] {
  if (!entries) return []
  const active: { lineageId: string; strategy: ActiveStrategy }[] = []
  for (const [lineageId, entry] of Object.entries(entries)) {
    const strategy = activeStrategy(entry, tick)
    if (strategy) active.push({ lineageId, strategy })
  }
  if (active.length === 0) return []

  const settlementsByLineage = new Map((settlements ?? []).map((s) => [s.lineage_id, s.center]))
  const needsMemberCenter = new Set<string>()
  for (const { lineageId } of active) {
    if (!settlementsByLineage.has(lineageId) && !homes?.[lineageId]) needsMemberCenter.add(lineageId)
  }

  const memberSums = new Map<string, { x: number; y: number; count: number }>()
  if (needsMemberCenter.size > 0) {
    for (const org of organisms) {
      if (!org.alive || !needsMemberCenter.has(org.lineage_id)) continue
      const sum = memberSums.get(org.lineage_id)
      if (sum) {
        sum.x += org.x
        sum.y += org.y
        sum.count++
      } else {
        memberSums.set(org.lineage_id, { x: org.x, y: org.y, count: 1 })
      }
    }
  }

  const positions: StrategyBeaconPosition[] = []
  for (const { lineageId, strategy } of active) {
    const settlement = settlementsByLineage.get(lineageId)
    const home = homes?.[lineageId]
    const members = memberSums.get(lineageId)
    if (!settlement && !home && !members) continue
    positions.push({
      lineageId,
      strategy,
      x: settlement?.[0] ?? home?.[0] ?? members!.x / members!.count,
      y: settlement?.[1] ?? home?.[1] ?? members!.y / members!.count,
    })
  }
  return positions
}

export function strategyTimeLabel(ticksRemaining: number): string {
  const days = Math.max(1, Math.ceil(ticksRemaining / 600))
  return `${days}d`
}
