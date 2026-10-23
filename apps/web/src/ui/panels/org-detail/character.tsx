import { Tooltip } from '../../toolbar/Tooltip'
import { cbColor } from '../../../shared/constants'
import { MiniBar } from './bars'
import { ASPIRATION_EMOJI, ASPIRATION_TIPS, ZODIAC_GLYPH, ZODIAC_FLAVOR } from './icons'
import type { OrganismState, OrgDetail } from '../../../shared/types'

export function AspirationSection({ org }: { org: OrganismState }) {
  return (
    <>
      {org.aspiration && (
        <>
          <div className="org-detail-section">ASPIRATION</div>
          <div className="relation-list">
            <span
              className="relation-tag"
              style={{ background: '#1a1408', color: '#f6d062', cursor: 'default' }}
              title={ASPIRATION_TIPS[org.aspiration] ?? ''}
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
  if (level >= 0.9) return 'master'
  if (level >= 0.65) return 'skilled'
  if (level >= 0.35) return 'handy'
  return 'learning'
}

/** What this person has learned to do, by doing it or by watching kin and friends. */
export function LearningSection({ detail }: { detail: OrgDetail | null }) {
  const skills = (detail?.skills ?? []).filter((s) => s.level >= 0.05).slice(0, 6)
  if (skills.length === 0) return null
  return (
    <>
      <div className="org-detail-section">SKILLS</div>
      <div className="trait-full-grid">
        {skills.map((s) => (
          <MiniBar
            key={s.name}
            label={s.name}
            value={s.level}
            valueLabel={skillRank(s.level)}
            color="#79d6b0"
            tip="Grows with practice and by watching kin and friends who are better at it. A practised hand succeeds more often and gets more out of the same work."
          />
        ))}
      </div>
    </>
  )
}

export function ZodiacSection({ org }: { org: OrganismState }) {
  return (
    <>
      {org.zodiac && (
        <>
          <div className="org-detail-section">BORN UNDER</div>
          <div className="relation-list">
            <span
              className="relation-tag"
              style={{ background: '#0e1018', color: '#9ad0f0', cursor: 'default' }}
              title={ZODIAC_FLAVOR[org.zodiac] ?? ''}
            >
              {ZODIAC_GLYPH[org.zodiac] ?? '✦'} {org.zodiac}
            </span>
            <span style={{ color: '#666', fontSize: 11, marginLeft: 6, fontStyle: 'italic' }}>
              {ZODIAC_FLAVOR[org.zodiac] ?? ''}
            </span>
          </div>
        </>
      )}
    </>
  )
}

export function TraitsSection({ org }: { org: OrganismState }) {
  return (
    <>
      <div className="org-detail-section">TRAITS</div>
      <div className="trait-full-grid">
        {(
          [
            [
              'curiosity',
              org.traits.curiosity,
              '#88aaff',
              'Curiosity - drives exploration and risk-taking. High curiosity organisms wander further and discover more.',
            ],
            [
              'aggression',
              org.traits.aggression,
              '#ff6655',
              'Aggression - determines combat initiation and territorial behaviour. High aggression = more challenges.',
            ],
            [
              'fear',
              org.traits.fear,
              '#ffcc44',
              'Fear - how quickly they flee danger. High fear means early retreat; low fear means standing ground.',
            ],
            [
              'memory',
              org.traits.memory_strength,
              '#aa88ff',
              'Memory - how many locations they retain and how strongly. Better memory = smarter navigation.',
            ],
            [
              'social',
              org.traits.social_tendency,
              '#55ddaa',
              'Social tendency - drives bonding, trading, and group travel. High social organisms form tribes faster.',
            ],
            [
              'resilience',
              org.traits.resilience,
              '#ff8844',
              'Resilience - resistance to disease, extreme temperatures, and starvation. Longer lifespan at high values.',
            ],
          ] as [string, number, string, string][]
        ).map(([label, val, col, tip]) => (
          <div key={label} className="trait-full-row">
            <Tooltip tip={tip}>
              <span className="trait-full-label" style={{ cursor: 'default' }}>
                {label}
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
