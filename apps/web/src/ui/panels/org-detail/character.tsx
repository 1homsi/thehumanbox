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

export function LearningSection({ detail }: { detail: OrgDetail | null }) {
  return (
    <>
      {detail?.learning && detail.learning.states > 0 && (
        <>
          <div className="org-detail-section">LEARNING</div>
          <div className="trait-full-grid">
            <MiniBar
              label="confidence"
              value={detail.learning.confidence}
              color="#79d6b0"
              tip="How consistently this person has found rewarding choices across situations."
            />
            <div className="trait-full-row">
              <Tooltip tip="Distinct situations this person has learned from.">
                <span className="trait-full-label" style={{ cursor: 'default' }}>
                  experience
                </span>
              </Tooltip>
              <span className="bar-pct">{detail.learning.states} states</span>
            </div>
            <div className="trait-full-row">
              <Tooltip tip="Situation-specific actions this person has actually attempted.">
                <span className="trait-full-label" style={{ cursor: 'default' }}>
                  choices tried
                </span>
              </Tooltip>
              <span className="bar-pct">{detail.learning.tried_actions}</span>
            </div>
            <div className="trait-full-row">
              <Tooltip tip="Situations where this person currently knows at least one promising response.">
                <span className="trait-full-label" style={{ cursor: 'default' }}>
                  useful lessons
                </span>
              </Tooltip>
              <span className="bar-pct">{detail.learning.promising_states}</span>
            </div>
          </div>
        </>
      )}
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
