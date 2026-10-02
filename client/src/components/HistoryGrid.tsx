import { memo } from 'react'
import { useWorldStore } from '../stores/worldStore'
import type { WorldHistory } from '../types'
import { Tooltip } from './Tooltip'

/** Each row of the world's history: label, explanation, and its count. */
const ROWS: Array<[string, string, (h: WorldHistory) => number | undefined]> = [
  ['births', 'Total people ever born into this world', (h) => h.births],
  ['old age', 'Deaths from old age: people who lived a full life', (h) => h.deaths_old_age],
  ['starvation', 'Deaths from hunger or thirst: not enough food or water', (h) => h.deaths_starvation],
  ['sickness', 'Deaths from disease', (h) => h.deaths_sickness],
  ['combat', 'Deaths in fights between neighbours and in wars between tribes', (h) => h.deaths_combat],
  ['beasts', 'Killed by wolves, bears and monsters', (h) => h.deaths_beasts],
  ['drowned', 'Drowned in deep or rising water', (h) => h.deaths_drowning],
  ['fire', 'Killed by wildfire', (h) => h.deaths_fire],
  [
    'disaster',
    "Killed by earthquakes, meteors, floods, storms, volcanoes and the gods' lightning",
    (h) => h.deaths_disaster,
  ],
  ['alliances', 'Alliances formed between tribes', (h) => h.alliances_formed],
  ['challenges', 'Territorial challenges: one person confronting another', (h) => h.challenges_total],
  ['gifts', 'Food given between people: kinship and friendship', (h) => h.gifts_total],
  ['droughts', 'Droughts: seasons of water scarcity', (h) => h.droughts],
  ['outbreaks', 'Disease outbreaks that swept through the population', (h) => h.outbreaks],
]

function HistoryGridImpl() {
  const h = useWorldStore((s) => s.world?.history)
  if (!h) return null
  return (
    <>
      <div className="section-title">WORLD HISTORY</div>
      <div className="history-grid">
        {ROWS.map(([label, tip, value]) => {
          const n = value(h)
          // Saves from before a cause was told apart have no count for it.
          if (n === undefined) return null
          return (
            <span key={label} style={{ display: 'contents' }}>
              <Tooltip tip={tip}>
                <span className="hist-label" style={{ cursor: 'default' }}>
                  {label}
                </span>
              </Tooltip>
              <span className="hist-val">{n}</span>
            </span>
          )
        })}
      </div>
    </>
  )
}

export const HistoryGrid = memo(HistoryGridImpl)
