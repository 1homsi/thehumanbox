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

export function strategyTimeLabel(ticksRemaining: number): string {
  const days = Math.max(1, Math.ceil(ticksRemaining / 600))
  return `${days}d`
}
