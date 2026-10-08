import { Bar } from './bars'
import { AGE_STAGE_ICON, ERA_ICON } from './icons'
import type { OrganismState } from '../../../shared/types'
import { skillPercent, skillWord } from '../../../game/model/skills'

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
            {'\u{1F4B0}'} rich
          </span>
        )}
        {org.discoveries?.includes('poor') && (
          <span
            className="relation-tag"
            style={{ background: '#1a1a2a', color: '#7a8898', cursor: 'default' }}
          >
            {'\u{1FAA8}'} poor
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
              <span style={{ opacity: 0.8 }} title={`skill ${skillPercent(org.skill)}`}>
                {' '}
                · {skillWord(org.skill)}
              </span>
            )}
          </span>
        )}
        {org.mood && org.mood !== 'calm' && (
          <span
            className="relation-tag"
            style={{ background: '#1a1a24', color: '#c8c2d8', cursor: 'default' }}
            title="How they feel right now, from what they are going through"
          >
            {MOOD_ICON[org.mood] ?? '·'} feels {org.mood}
          </span>
        )}
        {(org.mounted_vehicle ?? null) !== null && org.mounted_vehicle !== undefined && (
          <span
            className="relation-tag"
            style={{ background: '#1a2a0a', color: '#c4e688', cursor: 'default' }}
          >
            🛞 mounted
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

      <Bar label="energy" value={org.energy} color="#55dd55" />
      <Bar label="hydration" value={org.hydration} color="#4499ff" />
      <Bar label="health" value={org.health} color="#ff6644" />
      {isSick && <Bar label="infection" value={org.infection} color="#bbff44" />}
    </>
  )
}
