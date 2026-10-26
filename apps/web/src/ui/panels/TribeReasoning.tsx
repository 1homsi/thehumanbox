import { formatNumber, t, type MessageKey } from '../../i18n'
import type { TribeStatus } from '../../game/model/tribe-status'
import {
  tribeReasoning,
  type NextStep,
  type Objective,
  type Stance,
  type Work,
} from '../../game/model/tribe-reasoning'
import type { WorldState } from '../../shared/types'
import { GUIDANCE_LABEL } from '../../shared/guidance-words'
import type { LineageStrategy } from '../../simulation/sandbox'

const WORK_KEYS: Record<string, MessageKey> = {
  woodcutting: 'panels.tribe.why.work.woodcutting',
  quarrying: 'panels.tribe.why.work.quarrying',
  foraging: 'panels.tribe.why.work.foraging',
  fishing: 'panels.tribe.why.work.fishing',
  hunting: 'panels.tribe.why.work.hunting',
  farming: 'panels.tribe.why.work.farming',
  building: 'panels.tribe.why.work.building',
  crafting: 'panels.tribe.why.work.crafting',
  healing: 'panels.tribe.why.work.healing',
}

function strategyWord(strategy: string): string {
  const key = GUIDANCE_LABEL[strategy as LineageStrategy]
  return key ? t(key) : strategy
}

function objectiveLine(o: Objective): string {
  if (o.kind === 'unguided') return t('panels.tribe.why.unguided')
  return t('panels.tribe.why.guided', {
    strategy: strategyWord(o.strategy),
    done: formatNumber(o.progress),
    target: formatNumber(o.target),
  })
}

function workLine(work: Work[]): string {
  if (work.length === 0) return t('panels.tribe.why.idle')
  const list = work
    .map(({ skill, count }) => {
      const key = WORK_KEYS[skill]
      return `${key ? t(key) : skill} (${formatNumber(count)})`
    })
    .join(', ')
  return t('panels.tribe.why.doing', { list })
}

function stanceLine(s: Stance): string {
  const parts: string[] = []
  if (s.allied.length) parts.push(t('panels.tribe.why.allied', { names: s.allied.join(', ') }))
  if (s.rivals.length) parts.push(t('panels.tribe.why.rivals', { names: s.rivals.join(', ') }))
  if (s.neutral.length) parts.push(t('panels.tribe.why.neutral', { names: s.neutral.join(', ') }))
  return parts.length ? parts.join(' · ') : t('panels.tribe.why.stanceNone')
}

function nextLine(next: NextStep): string {
  switch (next.kind) {
    case 'need':
      return t('panels.tribe.why.next', { step: t(`panels.tribe.why.step.${next.need}`) })
    case 'campaign':
      return t('panels.tribe.why.next', {
        step: t('panels.tribe.why.step.campaign', { strategy: strategyWord(next.strategy) }),
      })
    case 'learn':
      return t('panels.tribe.why.next', { step: t('panels.tribe.why.step.learn', { secret: next.secret }) })
    case 'carryOn':
      return t('panels.tribe.why.next', { step: t('panels.tribe.why.step.carryOn') })
  }
}

/**
 * The tribe's reasoning, for its card: what it is guided to, what it needs most, what its people are at
 * work on, how it stands with its neighbours and what it is about to try.
 */
export function TribeReasoning({ world, status }: { world: WorldState; status: TribeStatus }) {
  const r = tribeReasoning(world, status)
  return (
    <section className="tribe-why" aria-label={t('panels.tribe.why.title')}>
      <div className="tribe-why-title">{t('panels.tribe.why.title')}</div>
      <p>{objectiveLine(r.objective)}</p>
      <p>
        {r.pressing
          ? t('panels.tribe.why.need', {
              need: t(`panels.tribe.why.needs.${r.pressing.need}`),
              pct: formatNumber(Math.round(r.pressing.short * 100)),
            })
          : t('panels.tribe.why.needNone')}
      </p>
      <p>{workLine(r.work)}</p>
      <p>{stanceLine(r.stance)}</p>
      <p className="tribe-why-next">{nextLine(r.next)}</p>
    </section>
  )
}
