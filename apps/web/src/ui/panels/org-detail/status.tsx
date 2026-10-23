import { Bar } from './bars'
import { AGE_STAGE_ICON, ERA_ICON } from './icons'
import type { OrganismState } from '../../../shared/types'
import { skillPercent, skillWord } from '../../../game/model/skills'
import { t, type MessageKey } from '../../../i18n'

/** A glyph for each mood word the simulation sends. */
const MOOD_ICON: Record<string, string> = {
  grieving: '✝',
  afraid: '!',
  hungry: '◌',
  thirsty: '◌',
  angry: '✶',
  joyful: '♪',
  content: '☺',
}

const SKILL_KEY: Record<string, MessageKey> = {
  master: 'person.status.skillWord.master',
  skilled: 'person.status.skillWord.skilled',
  journeyman: 'person.status.skillWord.journeyman',
  apprentice: 'person.status.skillWord.apprentice',
}

/** The skill level in words, translated from the level `skillWord` names. */
function skillLabel(practice: number): string {
  return t(SKILL_KEY[skillWord(practice)])
}

export function StatusChips({ org }: { org: OrganismState }) {
  return (
    <>
      <div className="org-detail-chips">
        {/* `wealth` is not in the server's `OrgJson`, so interpolating it
              here printed a fabricated "rich · 0" for every rich organism. */}
        {org.discoveries?.includes('rich') && (
          <span
            className="relation-tag"
            style={{ background: '#2a1f08', color: '#ffd966', cursor: 'default' }}
          >
            {'\u{1F4B0}'} {t('person.status.rich')}
          </span>
        )}
        {org.discoveries?.includes('poor') && (
          <span
            className="relation-tag"
            style={{ background: '#1a1a2a', color: '#7a8898', cursor: 'default' }}
          >
            {'\u{1FAA8}'} {t('person.status.poor')}
          </span>
        )}
        {(org.age_stage ?? null) && (
          <span
            className="relation-tag"
            style={{ background: '#1a1a2a', color: '#bbcce6', cursor: 'default' }}
          >
            {AGE_STAGE_ICON[org.age_stage as string] ?? '•'} {org.age_stage}
          </span>
        )}
        {(org.era ?? org.lineage_era ?? null) && (
          <span
            className="relation-tag"
            style={{ background: '#2a1a0a', color: '#e6c488', cursor: 'default' }}
          >
            {ERA_ICON[(org.era ?? org.lineage_era) as string] ?? '◷'} {org.era ?? org.lineage_era}
          </span>
        )}
        {(org.specialty ?? null) && (
          <span
            className="relation-tag"
            style={{ background: '#0a1a2a', color: '#88c6e6', cursor: 'default' }}
          >
            ★ {org.specialty}
            {org.skill != null && org.skill > 0 && (
              <span
                style={{ opacity: 0.8 }}
                title={t('person.status.skillTip', { percent: skillPercent(org.skill) })}
              >
                {' '}
                · {skillLabel(org.skill)}
              </span>
            )}
          </span>
        )}
        {(org.personality ?? []).map((word) => (
          <span
            key={word}
            className="relation-tag"
            style={{ background: '#241a14', color: '#e6c9a0', cursor: 'default' }}
            title={t('person.status.traitTip')}
          >
            {word}
          </span>
        ))}
        {org.mood && org.mood !== 'calm' && (
          <span
            className="relation-tag"
            style={{ background: '#1a1a24', color: '#c8c2d8', cursor: 'default' }}
            title={t('person.status.moodTip')}
          >
            {MOOD_ICON[org.mood] ?? '·'} {t('person.status.feels', { mood: org.mood })}
          </span>
        )}
        {(org.mounted_vehicle ?? null) !== null && org.mounted_vehicle !== undefined && (
          <span
            className="relation-tag"
            style={{ background: '#1a2a0a', color: '#c4e688', cursor: 'default' }}
          >
            🛞 {t('person.status.mounted')}
          </span>
        )}
      </div>
    </>
  )
}

export function Vitals({ org, isSick }: { org: OrganismState; isSick: boolean }) {
  return (
    <>
      <div className="org-detail-thought">{org.thought}</div>

      <Bar label={t('person.vitals.energy')} value={org.energy} color="#55dd55" />
      <Bar label={t('person.vitals.hydration')} value={org.hydration} color="#4499ff" />
      <Bar label={t('person.vitals.health')} value={org.health} color="#ff6644" />
      {isSick && <Bar label={t('person.vitals.infection')} value={org.infection} color="#bbff44" />}
    </>
  )
}
