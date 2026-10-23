import { MiniBar } from './bars'
import type { OrganismState } from '../../../shared/types'
import { formatNumber, t } from '../../../i18n'

export function MentalState({ org }: { org: OrganismState }) {
  return (
    <>
      {(org.loneliness !== undefined || org.comfort !== undefined) && (
        <>
          <div className="org-detail-section">{t('person.mental.title')}</div>
          <div className="trait-full-grid">
            {org.comfort !== undefined && (
              <MiniBar
                label={t('person.mental.label.comfort')}
                value={org.comfort}
                color="#88ddbb"
                tip={t('person.mental.tip.comfort')}
              />
            )}
            {org.loneliness !== undefined && (
              <MiniBar
                label={t('person.mental.label.loneliness')}
                value={org.loneliness}
                color="#aa88ff"
                invert
                tip={t('person.mental.tip.loneliness')}
              />
            )}
            {org.fear_level !== undefined && (
              <MiniBar
                label={t('person.mental.label.fear')}
                value={org.fear_level}
                color="#ff8844"
                invert
                tip={t('person.mental.tip.fear')}
              />
            )}
            {org.boredom !== undefined && (
              <MiniBar
                label={t('person.mental.label.boredom')}
                value={org.boredom}
                color="#ffcc44"
                invert
                tip={t('person.mental.tip.boredom')}
              />
            )}
            {org.sleep_debt !== undefined && org.sleep_debt > 0.05 && (
              <MiniBar
                label={t('person.mental.label.fatigue')}
                value={org.sleep_debt}
                color="#8899bb"
                invert
                tip={t('person.mental.tip.fatigue')}
              />
            )}
            {org.grief_ticks !== undefined && org.grief_ticks > 0 && (
              <div className="trait-full-row">
                <span className="trait-full-label">{t('person.mental.label.grieving')}</span>
                <span className="bar-pct" style={{ color: '#9988bb' }}>
                  {t('person.mental.ticks', { count: formatNumber(org.grief_ticks) })}
                </span>
              </div>
            )}
            {org.joy_ticks !== undefined && org.joy_ticks > 0 && (
              <div className="trait-full-row">
                <span className="trait-full-label">{t('person.mental.label.joyful')}</span>
                <span className="bar-pct" style={{ color: '#f6c46a' }}>
                  {t('person.mental.ticks', { count: formatNumber(org.joy_ticks) })}
                </span>
              </div>
            )}
            {org.hope !== undefined && (
              <MiniBar
                label={t('person.mental.label.hope')}
                value={org.hope}
                color="#a8e0ff"
                tip={t('person.mental.tip.hope')}
              />
            )}
            {org.awe !== undefined && org.awe > 0.05 && (
              <MiniBar
                label={t('person.mental.label.awe')}
                value={org.awe}
                color="#d8c8ff"
                tip={t('person.mental.tip.awe')}
              />
            )}
            {org.gratitude !== undefined && org.gratitude > 0.05 && (
              <MiniBar
                label={t('person.mental.label.gratitude')}
                value={org.gratitude}
                color="#ffd890"
                tip={t('person.mental.tip.gratitude')}
              />
            )}
            {org.jealousy !== undefined && org.jealousy > 0.05 && (
              <MiniBar
                label={t('person.mental.label.jealousy')}
                value={org.jealousy}
                color="#90a050"
                invert
                tip={t('person.mental.tip.jealousy')}
              />
            )}
            {org.anger !== undefined && org.anger > 0.05 && (
              <MiniBar
                label={t('person.mental.label.anger')}
                value={org.anger}
                color="#ff5028"
                invert
                tip={t('person.mental.tip.anger')}
              />
            )}
            {org.regret !== undefined && org.regret > 0.05 && (
              <MiniBar
                label={t('person.mental.label.regret')}
                value={org.regret}
                color="#7080a8"
                invert
                tip={t('person.mental.tip.regret')}
              />
            )}
            {org.curiosity_drive !== undefined && org.curiosity_drive > 0.05 && (
              <MiniBar
                label={t('person.mental.label.curiosity')}
                value={org.curiosity_drive}
                color="#80d0a8"
                tip={t('person.mental.tip.curiosity')}
              />
            )}
            {org.spiritual !== undefined && org.spiritual > 0.05 && (
              <MiniBar
                label={t('person.mental.label.spiritual')}
                value={org.spiritual}
                color="#e0c068"
                tip={t('person.mental.tip.spiritual')}
              />
            )}
          </div>
        </>
      )}
    </>
  )
}
