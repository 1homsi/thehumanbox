import { memo } from 'react'
import { useWorldStore } from '../../state/worldStore'
import type { WorldHistory } from '../../shared/types'
import { Tooltip } from '../toolbar/Tooltip'
import { formatNumber, t, type MessageKey } from '../../i18n'

/** Each row of the world's history: label key, explanation key, and its count. */
const ROWS: Array<[MessageKey, MessageKey, (h: WorldHistory) => number | undefined]> = [
  ['panels.history.births', 'panels.history.birthsTip', (h) => h.births],
  ['panels.history.oldAge', 'panels.history.oldAgeTip', (h) => h.deaths_old_age],
  ['panels.history.starvation', 'panels.history.starvationTip', (h) => h.deaths_starvation],
  ['panels.history.sickness', 'panels.history.sicknessTip', (h) => h.deaths_sickness],
  ['panels.history.combat', 'panels.history.combatTip', (h) => h.deaths_combat],
  ['panels.history.beasts', 'panels.history.beastsTip', (h) => h.deaths_beasts],
  ['panels.history.drowned', 'panels.history.drownedTip', (h) => h.deaths_drowning],
  ['panels.history.fire', 'panels.history.fireTip', (h) => h.deaths_fire],
  ['panels.history.disaster', 'panels.history.disasterTip', (h) => h.deaths_disaster],
  ['panels.history.alliances', 'panels.history.alliancesTip', (h) => h.alliances_formed],
  ['panels.history.challenges', 'panels.history.challengesTip', (h) => h.challenges_total],
  ['panels.history.gifts', 'panels.history.giftsTip', (h) => h.gifts_total],
  ['panels.history.droughts', 'panels.history.droughtsTip', (h) => h.droughts],
  ['panels.history.outbreaks', 'panels.history.outbreaksTip', (h) => h.outbreaks],
]

function HistoryGridImpl() {
  const h = useWorldStore((s) => s.world?.history)
  if (!h) return null
  return (
    <>
      <div className="section-title">{t('panels.history.title')}</div>
      <div className="history-grid">
        {ROWS.map(([label, tip, value]) => {
          const n = value(h)
          // Saves from before a cause was told apart have no count for it.
          if (n === undefined) return null
          return (
            <span key={label} style={{ display: 'contents' }}>
              <Tooltip tip={t(tip)}>
                <span className="hist-label" style={{ cursor: 'default' }}>
                  {t(label)}
                </span>
              </Tooltip>
              <span className="hist-val">{formatNumber(n)}</span>
            </span>
          )
        })}
      </div>
    </>
  )
}

export const HistoryGrid = memo(HistoryGridImpl)
