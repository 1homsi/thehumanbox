import { Tooltip } from '../../toolbar/Tooltip'
import { cbColor } from '../../../shared/constants'
import { MiniBar } from './bars'
import { ASPIRATION_EMOJI, ZODIAC_GLYPH, aspirationTip, zodiacFlavor } from './icons'
import type { OrganismState, OrgDetail } from '../../../shared/types'
import { t, type MessageKey } from '../../../i18n'

export function AspirationSection({ org }: { org: OrganismState }) {
  return (
    <>
      {org.aspiration && (
        <>
          <div className="org-detail-section">{t('person.aspiration.title')}</div>
          <div className="relation-list">
            <span
              className="relation-tag"
              style={{ background: '#1a1408', color: '#f6d062', cursor: 'default' }}
              title={aspirationTip(org.aspiration)}
            >
              {ASPIRATION_EMOJI[org.aspiration] ?? '✦'} {org.aspiration}
            </span>
          </div>
        </>
      )}
    </>
  )
}

/** How a skill level reads: the same lines the simulation marks milestones at. */
function skillRank(level: number): string {
  if (level >= 0.9) return t('person.skills.rank.master')
  if (level >= 0.65) return t('person.skills.rank.skilled')
  if (level >= 0.35) return t('person.skills.rank.handy')
  return t('person.skills.rank.learning')
}

const SKILL_NAMES: Record<string, MessageKey> = {
  woodcutting: 'person.skills.name.woodcutting',
  quarrying: 'person.skills.name.quarrying',
  foraging: 'person.skills.name.foraging',
  fishing: 'person.skills.name.fishing',
  hunting: 'person.skills.name.hunting',
  farming: 'person.skills.name.farming',
  building: 'person.skills.name.building',
  crafting: 'person.skills.name.crafting',
  healing: 'person.skills.name.healing',
}

/** A skill's name in the interface language; one the interface does not know stays as the simulation sent it. */
function skillName(name: string): string {
  const key = SKILL_NAMES[name]
  return key ? t(key) : name
}

/** What this person has learned to do, by doing it or by watching kin and friends. */
/** Likings this strong are worth a mention; dread this deep keeps them from the work. */
const ENJOYS = 0.15
const AVOIDS = -0.3

export function LearningSection({ detail }: { detail: OrgDetail | null }) {
  const all = detail?.skills ?? []
  const skills = all.filter((s) => s.level >= 0.05).slice(0, 6)
  const enjoys = all.filter((s) => (s.feeling ?? 0) >= ENJOYS).map((s) => skillName(s.name))
  const avoids = all.filter((s) => (s.feeling ?? 0) <= AVOIDS).map((s) => skillName(s.name))
  if (skills.length === 0 && avoids.length === 0) return null
  return (
    <>
      <div className="org-detail-section">{t('person.skills.title')}</div>
      <div className="trait-full-grid">
        {skills.map((s) => (
          <MiniBar
            key={s.name}
            label={skillName(s.name)}
            value={s.level}
            valueLabel={skillRank(s.level)}
            color="#79d6b0"
            tip={t('person.skills.tip')}
          />
        ))}
      </div>
      {enjoys.length > 0 && (
        <div className="trait-full-row" style={{ color: '#79d6b0', fontSize: 11 }}>
          {t('person.skills.enjoys', { list: enjoys.join(', ') })}
        </div>
      )}
      {avoids.length > 0 && (
        <div className="trait-full-row" style={{ color: '#e8a070', fontSize: 11 }}>
          {t('person.skills.avoids', { list: avoids.join(', ') })}
        </div>
      )}
    </>
  )
}

export function ZodiacSection({ org }: { org: OrganismState }) {
  return (
    <>
      {org.zodiac && (
        <>
          <div className="org-detail-section">{t('person.zodiac.title')}</div>
          <div className="relation-list">
            <span
              className="relation-tag"
              style={{ background: '#0e1018', color: '#9ad0f0', cursor: 'default' }}
              title={zodiacFlavor(org.zodiac)}
            >
              {ZODIAC_GLYPH[org.zodiac] ?? '✦'} {org.zodiac}
            </span>
            <span style={{ color: '#666', fontSize: 11, marginLeft: 6, fontStyle: 'italic' }}>
              {zodiacFlavor(org.zodiac)}
            </span>
          </div>
        </>
      )}
    </>
  )
}

export function TraitsSection({ org }: { org: OrganismState }) {
  const traits: [MessageKey, MessageKey, number, string][] = [
    ['person.traits.label.curiosity', 'person.traits.tip.curiosity', org.traits.curiosity, '#88aaff'],
    ['person.traits.label.aggression', 'person.traits.tip.aggression', org.traits.aggression, '#ff6655'],
    ['person.traits.label.fear', 'person.traits.tip.fear', org.traits.fear, '#ffcc44'],
    ['person.traits.label.memory', 'person.traits.tip.memory', org.traits.memory_strength, '#aa88ff'],
    ['person.traits.label.social', 'person.traits.tip.social', org.traits.social_tendency, '#55ddaa'],
    ['person.traits.label.resilience', 'person.traits.tip.resilience', org.traits.resilience, '#ff8844'],
  ]
  return (
    <>
      <div className="org-detail-section">{t('person.traits.title')}</div>
      <div className="trait-full-grid">
        {traits.map(([label, tip, val, col]) => (
          <div key={label} className="trait-full-row">
            <Tooltip tip={t(tip)}>
              <span className="trait-full-label" style={{ cursor: 'default' }}>
                {t(label)}
              </span>
            </Tooltip>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${val * 100}%`, background: cbColor(col) }} />
            </div>
            <span className="bar-pct">{(val * 100).toFixed(0)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
