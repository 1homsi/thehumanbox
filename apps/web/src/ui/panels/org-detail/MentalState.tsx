import { MiniBar } from './bars'
import type { OrganismState } from '../../../shared/types'

export function MentalState({ org }: { org: OrganismState }) {
  return (
    <>
      {(org.loneliness !== undefined || org.comfort !== undefined) && (
        <>
          <div className="org-detail-section">MENTAL STATE</div>
          <div className="trait-full-grid">
            {org.comfort !== undefined && (
              <MiniBar
                label="comfort"
                value={org.comfort}
                color="#88ddbb"
                tip="Comfort - rises near shelter and kin, falls in harsh conditions. High comfort boosts recovery."
              />
            )}
            {org.loneliness !== undefined && (
              <MiniBar
                label="loneliness"
                value={org.loneliness}
                color="#aa88ff"
                invert
                tip="Loneliness - builds when isolated, eased by social contact. High loneliness drives them to seek others."
              />
            )}
            {org.fear_level !== undefined && (
              <MiniBar
                label="fear"
                value={org.fear_level}
                color="#ff8844"
                invert
                tip="Fear - spikes near predators and danger. Overrides normal behaviour; organism will flee."
              />
            )}
            {org.boredom !== undefined && (
              <MiniBar
                label="boredom"
                value={org.boredom}
                color="#ffcc44"
                invert
                tip="Boredom - rises when idle. Pushes the organism to explore, wander, or take risks."
              />
            )}
            {org.sleep_debt !== undefined && org.sleep_debt > 0.05 && (
              <MiniBar
                label="fatigue"
                value={org.sleep_debt}
                color="#8899bb"
                invert
                tip="Fatigue - builds without rest. Organism seeks shelter to sleep; high fatigue drains health."
              />
            )}
            {org.grief_ticks !== undefined && org.grief_ticks > 0 && (
              <div className="trait-full-row">
                <span className="trait-full-label">grieving</span>
                <span className="bar-pct" style={{ color: '#9988bb' }}>
                  {org.grief_ticks} ticks
                </span>
              </div>
            )}
            {org.joy_ticks !== undefined && org.joy_ticks > 0 && (
              <div className="trait-full-row">
                <span className="trait-full-label">joyful</span>
                <span className="bar-pct" style={{ color: '#f6c46a' }}>
                  {org.joy_ticks} ticks
                </span>
              </div>
            )}
            {org.hope !== undefined && (
              <MiniBar
                label="hope"
                value={org.hope}
                color="#a8e0ff"
                tip="Hope - rises when safe and well-fed, falls under threat or hunger."
              />
            )}
            {org.awe !== undefined && org.awe > 0.05 && (
              <MiniBar
                label="awe"
                value={org.awe}
                color="#d8c8ff"
                tip="Awe - deepens under open sky at night. Feeds spiritual growth."
              />
            )}
            {org.gratitude !== undefined && org.gratitude > 0.05 && (
              <MiniBar
                label="gratitude"
                value={org.gratitude}
                color="#ffd890"
                tip="Gratitude - accumulates in comfort surrounded by kin. Drives sharing."
              />
            )}
            {org.jealousy !== undefined && org.jealousy > 0.05 && (
              <MiniBar
                label="jealousy"
                value={org.jealousy}
                color="#90a050"
                invert
                tip="Jealousy - creeps when rivals encroach during scarcity."
              />
            )}
            {org.anger !== undefined && org.anger > 0.05 && (
              <MiniBar
                label="anger"
                value={org.anger}
                color="#ff5028"
                invert
                tip="Anger - spikes against hostile neighbours, cools quickly when safe."
              />
            )}
            {org.regret !== undefined && org.regret > 0.05 && (
              <MiniBar
                label="regret"
                value={org.regret}
                color="#7080a8"
                invert
                tip="Regret - carried after outbursts or long grief."
              />
            )}
            {org.curiosity_drive !== undefined && org.curiosity_drive > 0.05 && (
              <MiniBar
                label="curiosity"
                value={org.curiosity_drive}
                color="#80d0a8"
                tip="Curiosity drive - bored, well-fed organisms wander further."
              />
            )}
            {org.spiritual !== undefined && org.spiritual > 0.05 && (
              <MiniBar
                label="spiritual"
                value={org.spiritual}
                color="#e0c068"
                tip="Spiritual depth - rises in safe nighttime shelter. Draws pilgrimages to temples."
              />
            )}
          </div>
        </>
      )}
    </>
  )
}
