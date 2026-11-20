import clsx from 'clsx'
import { useRef } from 'react'
import { DAY_TICKS, SEASON_TICKS } from '../../game/model/calendar'
import {
  holdUrgency,
  lossTrend,
  recordLoss,
  urgencyColor,
  type HeldUrgency,
  type LossSample,
  type LossTrend,
  type TribeUrgency as Urgency,
  type UrgencyKind,
} from '../../game/model/tribe-urgency'
import { Tooltip } from '../toolbar/Tooltip'
import { formatNumber, t, type MessageKey } from '../../i18n'

const KIND_KEYS: Record<UrgencyKind, MessageKey> = {
  famine: 'panels.tribe.urgency.famine',
  thirst: 'panels.tribe.urgency.thirst',
  war: 'panels.tribe.urgency.war',
  plague: 'panels.tribe.urgency.plague',
  danger: 'panels.tribe.urgency.danger',
}

const TREND_KEYS: Record<LossTrend, MessageKey> = {
  rising: 'panels.tribe.urgency.rising',
  easing: 'panels.tribe.urgency.easing',
  flat: 'panels.tribe.steady',
}

const ARROWS: Record<LossTrend, string> = { rising: '▲', easing: '▼', flat: '▶' }

export function UrgencyTip({ kind }: { kind: UrgencyKind }) {
  return (
    <span className="tip-card">
      <strong>{t(KIND_KEYS[kind])}</strong>
      <span>{t('panels.tribe.urgency.tip', { days: formatNumber(SEASON_TICKS / DAY_TICKS) })}</span>
    </span>
  )
}

interface Props {
  tick: number
  urgency: Urgency | null
}

export function TribeUrgency({ tick, urgency }: Props) {
  const held = useRef<HeldUrgency | null>(null)
  const samples = useRef<LossSample[]>([])
  held.current = holdUrgency(held.current, urgency, tick)
  const shown = held.current?.urgency
  if (!shown) {
    samples.current = []
    return null
  }
  samples.current = recordLoss(samples.current, tick, shown.lost)
  const direction = lossTrend(samples.current)
  const survivors = shown.total > 0 ? shown.alive / shown.total : 1
  const count =
    shown.lost > 0
      ? t('panels.tribe.urgency.lost', {
          count: formatNumber(shown.lost),
          total: formatNumber(shown.total),
        })
      : t('panels.tribe.urgency.noneLost')
  return (
    <Tooltip tip={<UrgencyTip kind={shown.kind} />}>
      <div
        className={clsx('tribe-urgency', shown.level >= 0.5 && 'grave')}
        role="status"
        tabIndex={0}
        aria-label={`${t(KIND_KEYS[shown.kind])}: ${count}, ${t(TREND_KEYS[direction])}`}
        style={{ '--urgency': urgencyColor(shown.level) } as React.CSSProperties}
      >
        <div className="tribe-urgency-head">
          <span className="tribe-urgency-kind">{t(KIND_KEYS[shown.kind])}</span>
          <span className="tribe-urgency-count">
            {count}
            <span className={clsx('tribe-urgency-trend', direction)} aria-hidden="true">
              {ARROWS[direction]}
            </span>
          </span>
        </div>
        <span className="tribe-urgency-gauge" aria-hidden="true">
          <span style={{ width: `${Math.round(survivors * 100)}%` }} />
        </span>
      </div>
    </Tooltip>
  )
}
