import { memo, useMemo } from 'react'
import clsx from 'clsx'
import { useShallow } from 'zustand/react/shallow'
import { lineageColor } from '../../../shared/constants'
import { useUIStore } from '../../../state/store'
import { popHistory, useWorldStore } from '../../../state/worldStore'
import { trend } from '../../../game/model/pop-history'
import { visibleLineages } from '../../../game/model/tribe-peril'
import { MOOD_TONE, tribeMood, type TribeMood } from '../../../game/model/tribe-mood'
import { activeBattles } from '../../../game/render/battles'
import type { PerilCause } from '../../../shared/types'
import { formatNumber, t } from '../../../i18n'
import { Tooltip } from '../../toolbar/Tooltip'
import { SectionHead } from './InfoTip'

interface TribeRow {
  id: string
  name: string
  count: number
  peril?: PerilCause
  mood: TribeMood
  trend: 'up' | 'down' | 'flat'
}

const TREND_MARK = { up: '▲', down: '▼', flat: '' } as const

function TribeListImpl() {
  const focus = useUIStore((s) => s.focus)
  const setFocus = useUIStore((s) => s.setFocus)
  const openAllLineages = useUIStore((s) => s.openAllLineages)
  const stamps = useWorldStore(
    useShallow((s) => {
      const sums: Record<string, [number, number, number, number]> = {}
      for (const o of s.world?.organisms ?? []) {
        if (!o.alive || !o.lineage_id) continue
        const row = (sums[o.lineage_id] ??= [0, 0, 0, 0])
        row[0] += 1
        row[1] += o.energy
        row[2] += o.health
        if (o.infection > 0.15) row[3] += 1
      }
      const out: Record<string, string> = {}
      for (const [id, [n, food, health, sick]] of Object.entries(sums)) {
        out[id] = `${n},${Math.round((food / n) * 10)},${Math.round((health / n) * 10)},${sick}`
      }
      return out
    }),
  )
  const names = useWorldStore((s) => s.world?.lineage_names)
  const peril = useWorldStore(
    useShallow((s) => {
      const out: Record<string, PerilCause> = {}
      for (const p of s.world?.tribes_in_peril ?? []) out[p.lineage_id] = p.cause
      return out
    }),
  )
  const atWar = useWorldStore(
    useShallow((s) => [
      ...new Set(activeBattles(s.world?.battles).flatMap((b) => [...b.attackers, ...b.defenders])),
    ]),
  )

  const starving = useWorldStore(
    useShallow((s) =>
      Object.entries(s.world?.tribe_losses ?? {})
        .filter(([, losses]) => (losses?.starvation ?? 0) > 0)
        .map(([id]) => id),
    ),
  )

  const rows = useMemo((): TribeRow[] => {
    const war = new Set(atWar)
    const hungry = new Set(starving)
    return Object.entries(stamps).map(([id, stamp]) => {
      const [count, food, health, sick] = stamp.split(',').map(Number) as [number, number, number, number]
      const direction = trend(popHistory.get(id) ?? [])
      return {
        id,
        name: names?.[id] ?? id.slice(0, 6),
        count,
        peril: peril[id],
        trend: direction,
        mood: tribeMood({
          people: count,
          food: food / 10,
          health: health / 10,
          sick,
          peril: peril[id],
          atWar: war.has(id),
          starving: hungry.has(id),
          trend: direction,
        }),
      }
    })
  }, [stamps, names, peril, atWar, starving])

  if (rows.length === 0) return null
  const urgent = rows.filter((r) => MOOD_TONE[r.mood] === 'bad').sort((a, b) => b.count - a.count)
  const rest = visibleLineages(rows.filter((r) => MOOD_TONE[r.mood] !== 'bad'))
  const shown = [...urgent, ...rest].slice(0, Math.max(5, urgent.length))

  return (
    <section className="wp-tribes">
      <SectionHead title={t('panels.world.tribes.title')} tip={t('panels.world.tribes.tip')} />
      <ul className="wp-tribe-list">
        {shown.map((r) => {
          const active = focus === `lineage:${r.id}`
          return (
            <li key={r.id}>
              <button
                type="button"
                className={clsx('wp-tribe', active && 'active')}
                aria-pressed={active}
                title={active ? t('panels.lineages.showAll') : t('panels.lineages.focus', { name: r.name })}
                onClick={() => setFocus(active ? 'all' : `lineage:${r.id}`)}
              >
                <span className="lineage-dot" style={{ background: lineageColor(r.id) }} />
                <span className="wp-tribe-name">{r.name}</span>
                <span
                  className="wp-tribe-count"
                  aria-label={t('panels.world.now.people', { count: formatNumber(r.count) })}
                >
                  {formatNumber(r.count)}
                  {r.trend !== 'flat' && (
                    <span className={clsx('wp-trend', `trend-${r.trend}`)} aria-hidden="true">
                      {TREND_MARK[r.trend]}
                    </span>
                  )}
                </span>
                <Tooltip tip={t(`panels.world.tribes.moodTip.${r.mood}`)}>
                  <span className={clsx('wp-mood', `tone-${MOOD_TONE[r.mood]}`)}>
                    {t(`panels.world.tribes.mood.${r.mood}`)}
                  </span>
                </Tooltip>
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length > shown.length && (
        <button type="button" className="wp-link" onClick={openAllLineages}>
          {t('panels.world.tribes.viewAll', { count: formatNumber(rows.length) })}
        </button>
      )}
    </section>
  )
}

export const TribeList = memo(TribeListImpl)
