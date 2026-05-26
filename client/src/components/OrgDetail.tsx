import clsx from 'clsx'
import { useState } from 'react'
import type { OrganismState } from '../types'
import { lineageColor, cbColor } from '../utils/constants'
import { Tooltip } from './Tooltip'
import { useOrgDetail } from '../hooks/useOrgDetail'
import { useUIStore } from '../stores/store'
import { useSceneStore } from '../stores/scene'
import { hasBuiltHome, isAtHome } from '../scenes'
import { useWorldStore } from '../stores/worldStore'
import { LifeModal } from './LifeModal'

const DAY_LENGTH = 600

function fmt(ticks: number) {
  const days = Math.floor(ticks / DAY_LENGTH)
  return days === 1 ? '1 day' : `${days} days`
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ width: `${Math.min(value, 1) * 100}%`, background: cbColor(color) }}
        />
      </div>
      <span className="bar-pct">{(value * 100).toFixed(0)}%</span>
    </div>
  )
}

function MiniBar({
  label,
  value,
  color,
  invert,
  tip,
}: {
  label: string
  value: number
  color: string
  invert?: boolean
  tip?: string
}) {
  const w = Math.min(value, 1) * 100
  const labelEl = (
    <span className="trait-full-label" style={{ cursor: 'default' }}>
      {label}
    </span>
  )
  return (
    <div className="trait-full-row">
      {tip ? <Tooltip tip={tip}>{labelEl}</Tooltip> : labelEl}
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{
            width: `${w}%`,
            background: cbColor(color),
            opacity: invert ? 0.7 + value * 0.3 : 0.6 + value * 0.4,
          }}
        />
      </div>
      <span className="bar-pct">{(value * 100).toFixed(0)}</span>
    </div>
  )
}

const AGE_STAGE_ICON: Record<string, string> = {
  infant: '👶',
  child: '🧒',
  teen: '🧑',
  adult: '🧔',
  elder: '🧓',
}

const ERA_ICON: Record<string, string> = {
  PreStone: '🪨',
  Stone: '🛖',
  Bronze: '⚒️',
  Iron: '⚔️',
  Classical: '🏛️',
  Medieval: '🏰',
  Renaissance: '🎨',
  Industrial: '🏭',
  Modern: '⚙️',
  Information: '💻',
}

const ASPIRATION_EMOJI: Record<string, string> = {
  seeker: '🔍',
  wanderer: '🧭',
  warrior: '⚔️',
  connector: '🤝',
  builder: '🔨',
  devout: '🕯️',
  sage: '📜',
  provider: '🌾',
  artist: '🎨',
  healer: '🌿',
}

const ASPIRATION_TIPS: Record<string, string> = {
  seeker: 'Drawn to knowledge — pursues exploration, science, and learning.',
  wanderer: 'Restless and curious — happiest on the road, far from settlements.',
  warrior: 'Born for conflict — gravitates toward combat and military life.',
  connector: 'Lives for others — seeks partnerships, friendships, family.',
  builder: 'Wants to make things — construction and craft are their calling.',
  devout: 'A spiritual life — religion, ritual, and devotion guide them.',
  sage: 'A teacher at heart — passes knowledge to the next generation.',
  provider: 'Tends the household — agriculture, food, and family care.',
  artist: 'Makes for the sake of making — paintings, song, written words.',
  healer: 'Tends the sick — medicine, herbs, and the long patience of care.',
}

const ZODIAC_GLYPH: Record<string, string> = {
  ember: '🜂',
  wave: '🜄',
  stone: '🜃',
  root: '꙰',
  bough: 'ᛉ',
  crane: 'ᛯ',
  wolf: 'ᛯ',
  dawn: '☼',
  hearth: 'ᚦ',
  veil: 'ᛏ',
  spear: 'ᛇ',
  seed: '᛫',
}

const ZODIAC_FLAVOR: Record<string, string> = {
  ember: 'warm-hearted and quick to act',
  wave: 'fluid, patient, follows the moon',
  stone: 'steady, slow to anger, slow to fall',
  root: 'drawn deep, holds onto kin',
  bough: 'reaches outward, growing always',
  crane: 'watchful, long memory, careful step',
  wolf: 'hunts in silence, trusts the pack',
  dawn: 'born of light, restless until day',
  hearth: 'keeps the fire, tends the home',
  veil: 'quiet, sees what others miss',
  spear: 'true-aimed, blunt, unafraid',
  seed: 'small now, but everything is coming',
}

const TOOL_ICON: Record<string, string> = {
  StoneAxe: '🪓',
  BronzeSpear: '🔱',
  IronSword: '⚔️',
  Plow: '🚜',
  Musket: '🔫',
  Rifle: '🎯',
  Book: '📕',
  Computer: '💻',
  Bow: '🏹',
  Hammer: '🔨',
  Wheel: '☸️',
  stone_axe: '🪓',
  bronze_spear: '🔱',
  iron_sword: '⚔️',
  plow: '🚜',
  musket: '🔫',
  rifle: '🎯',
  book: '📕',
  computer: '💻',
  bow: '🏹',
  hammer: '🔨',
  wheel: '☸️',
  mash: '🌾',
  wash: '🫙',
  spirit: '🥃',
  aged_spirit: '🛢️',
  blended_spirit: '🍷',
  bottled_spirit: '🍾',
  bottle: '🍶',
  meat: '🥩',
  cuts: '🔪',
  ground: '🍖',
  sausage: '🌭',
  preserved: '🧂',
  preserved_meat: '🧂',
  pattern: '📐',
  piece: '🧵',
  garment: '👕',
  lead: '🔎',
  quote: '💬',
  herb: '🌿',
  potion: '🧪',
  salve: '🧴',
  bandage: '🩹',
  candle: '🕯️',
  basket: '🧺',
  rope: '🪢',
  net: '🥅',
  pot: '🪴',
  bread: '🍞',
  cheese: '🧀',
  fish: '🐟',
  egg: '🥚',
  honey: '🍯',
  wine: '🍷',
  ale: '🍺',
  paint: '🎨',
  scroll: '📜',
  draft: '📝',
  article: '📰',
  coffee: '☕',
  milk: '🥛',
  drink: '🍵',
  pastry: '🥐',
  stock: '📦',
  incident: '🚨',
}

interface Props {
  org: OrganismState
  onClose: () => void
  onFollow: (id: string | null) => void
  following: boolean
  lineageNames?: Record<string, string>
  organisms?: OrganismState[]
  religions?: import('../types').ReligionInfo[]
  onSelectOrg?: (id: string) => void
}

function HomeButton({ org }: { org: OrganismState }) {
  const world = useWorldStore((s) => s.world)
  if (!world) return null
  const built = hasBuiltHome(org, world)
  if (!built) return null
  const inside = isAtHome(org, world)
  return (
    <Tooltip tip={inside ? 'Step inside their home' : 'Visit their home (they are out)'}>
      <button
        className="icon-btn"
        aria-label="Look inside"
        onClick={() => useSceneStore.getState().enter({ kind: 'home', orgId: org.id })}
      >
        ⌂
      </button>
    </Tooltip>
  )
}

export function OrgDetail({ org, onClose, onFollow, following, lineageNames, organisms, religions, onSelectOrg }: Props) {
  const { data: detail } = useOrgDetail(org.id)
  const [showLife, setShowLife] = useState(false)
  const starredOrgIds = useUIStore((s) => s.starredOrgIds)
  const toggleStar = useUIStore((s) => s.toggleStar)
  const isStarred = starredOrgIds.includes(org.id)
  const tn = (lid: string) => lineageNames?.[lid] ?? (lid ?? '').slice(0, 6)
  const on = (oid: string) => organisms?.find((o) => o.id === oid)?.name ?? (oid ?? '').slice(0, 5)
  const ageInDays = Math.floor(org.age / DAY_LENGTH)
  const color = lineageColor(org.lineage_id)
  const isSick = org.infection > 0.15
  const carrying = org.carrying > 0

  const allies = Object.entries(org.attitudes ?? {})
    .filter(([, v]) => v >= 0.25)
    .sort((a, b) => b[1] - a[1])
  const enemies = Object.entries(org.attitudes ?? {})
    .filter(([, v]) => v <= -0.25)
    .sort((a, b) => a[1] - b[1])

  const trustedOrgs = Object.entries(org.org_trust ?? {})
    .filter(([, v]) => v >= 0.2)
    .sort((a, b) => b[1] - a[1])
  const fearedOrgs = Object.entries(org.org_trust ?? {})
    .filter(([, v]) => v <= -0.2)
    .sort((a, b) => a[1] - b[1])

  const history = [...(detail?.thought_history ?? [])]
    .filter((e) => !['observing', 'satisfied', 'exploring'].includes(e.text))
    .slice(-12)
    .reverse()

  const witnessed = [...(detail?.life_log ?? [])]
    .filter((e) => e.category === 'witnessed')
    .slice(-8)
    .reverse()

  return (
    <>
      {showLife && <LifeModal orgId={org.id} orgName={org.name} onClose={() => setShowLife(false)} />}
      <div className="org-detail" style={{ borderTop: `3px solid ${color}` }}>
        <div className="org-detail-header">
          <span className="org-detail-dot" style={{ background: color }} />
          <span className="org-detail-name">{org.name}</span>
          {isSick && <span className="org-sick-badge">sick</span>}
          {carrying && (
            <Tooltip tip="Carrying wood">
              <span className="org-carrying-badge" style={{ cursor: 'default' }}>
                🪵
              </span>
            </Tooltip>
          )}
          <span className="org-detail-actions">
            <Tooltip tip={isStarred ? 'Unstar' : 'Star this organism (saved across reloads)'}>
              <button
                className={clsx('icon-btn', isStarred && 'active-star')}
                aria-label={isStarred ? 'Unstar' : 'Star'}
                onClick={() => toggleStar(org.id)}
              >
                {isStarred ? '★' : '☆'}
              </button>
            </Tooltip>
            <Tooltip tip="View full life history">
              <button className="icon-btn" aria-label="Life" onClick={() => setShowLife(true)}>
                📖
              </button>
            </Tooltip>
            <HomeButton org={org} />
            <Tooltip tip={following ? 'Following' : 'Follow this organism'}>
              <button
                className={clsx('icon-btn', following && 'active')}
                aria-label={following ? 'Unfollow' : 'Follow'}
                onClick={() => onFollow(following ? null : org.id)}
              >
                ⊙
              </button>
            </Tooltip>
            <button aria-label="Close" className="icon-btn icon-close" onClick={onClose}>
              ✕
            </button>
          </span>
        </div>

        <div className="org-detail-sub">
          gen {org.generation} ·{' '}
          {ageInDays > 0 ? `${ageInDays} day${ageInDays !== 1 ? 's' : ''} old` : 'newborn'}
          {' · '}
          {tn(org.lineage_id)}
          {org.max_age > 0 && ` · max ${fmt(org.max_age)}`}
        </div>

        <div className="org-detail-chips">
          {org.discoveries?.includes('rich') && (
            <span
              className="relation-tag"
              style={{ background: '#2a1f08', color: '#ffd966', cursor: 'default' }}
              title={`Wealth: ${org.wealth ?? 0}`}
            >
              {'\u{1F4B0}'} rich · {org.wealth ?? 0}
            </span>
          )}
          {org.discoveries?.includes('poor') && (
            <span
              className="relation-tag"
              style={{ background: '#1a1a2a', color: '#7a8898', cursor: 'default' }}
              title={`Wealth: ${org.wealth ?? 0}`}
            >
              {'\u{1FAA8}'} poor · {org.wealth ?? 0}
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

        <div className="org-detail-thought">{org.thought}</div>

        <Bar label="energy" value={org.energy} color="#55dd55" />
        <Bar label="hydration" value={org.hydration} color="#4499ff" />
        <Bar label="health" value={org.health} color="#ff6644" />
        {isSick && <Bar label="infection" value={org.infection} color="#bbff44" />}

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
            </div>
          </>
        )}

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

        {(allies.length > 0 || enemies.length > 0) && (
          <>
            <div className="org-detail-section">RELATIONS</div>
            <div className="relation-list">
              {allies.map(([lid, v]) => (
                <Tooltip
                  key={lid}
                  tip={`Allied with ${tn(lid)} - ${(v * 100).toFixed(0)}% positive attitude. Likely to trade and cooperate.`}
                >
                  <span className="relation-tag ally" style={{ cursor: 'default' }}>
                    ♥ {tn(lid)} {(v * 100).toFixed(0)}%
                  </span>
                </Tooltip>
              ))}
              {enemies.map(([lid, v]) => (
                <Tooltip
                  key={lid}
                  tip={`Hostile toward ${tn(lid)} - ${(Math.abs(v) * 100).toFixed(0)}% negative attitude. Likely to challenge or avoid.`}
                >
                  <span className="relation-tag enemy" style={{ cursor: 'default' }}>
                    ✕ {tn(lid)} {(v * 100).toFixed(0)}%
                  </span>
                </Tooltip>
              ))}
            </div>
          </>
        )}

        {(trustedOrgs.length > 0 || fearedOrgs.length > 0) && (
          <>
            <div className="org-detail-section">PERSONAL BONDS</div>
            <div className="relation-list">
              {trustedOrgs.slice(0, 4).map(([oid, v]) => (
                <Tooltip
                  key={oid}
                  tip={`Trusts ${on(oid)} - personal bond at ${(v * 100).toFixed(0)}%. Built through shared experiences and cooperation.`}
                >
                  <span className="relation-tag ally" style={{ fontSize: '9px', cursor: 'default' }}>
                    ◆ {on(oid)} {(v * 100).toFixed(0)}
                  </span>
                </Tooltip>
              ))}
              {fearedOrgs.slice(0, 4).map(([oid, v]) => (
                <Tooltip
                  key={oid}
                  tip={`Fears ${on(oid)} - negative bond at ${(Math.abs(v) * 100).toFixed(0)}%. Result of past conflict or aggression.`}
                >
                  <span className="relation-tag enemy" style={{ fontSize: '9px', cursor: 'default' }}>
                    ◇ {on(oid)} {(v * 100).toFixed(0)}
                  </span>
                </Tooltip>
              ))}
            </div>
          </>
        )}

        {((org.literacy ?? null) !== null || (org.degrees ?? []).length > 0) && (
          <>
            <div className="org-detail-section">EDUCATION</div>
            {(org.literacy ?? null) !== null && (
              <Bar label="literacy" value={org.literacy ?? 0} color="#c4a8ff" />
            )}
            {(org.degrees ?? []).length > 0 && (
              <div className="relation-list">
                {(org.degrees ?? []).map((d) => (
                  <span
                    key={d}
                    className="relation-tag"
                    style={{ background: '#1a0a2a', color: '#d8b8ff', cursor: 'default' }}
                  >
                    🎓 {d}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {(org.wealth ?? null) !== null && (org.wealth ?? 0) > 0 && (
          <>
            <div className="org-detail-section">WEALTH</div>
            <div className="org-memory" style={{ marginBottom: 6 }}>
              <span style={{ cursor: 'default' }}>💰 {org.wealth}</span>
            </div>
          </>
        )}

        {(() => {
          const bag: Record<string, number> = {
            ...(org.inventory ?? {}),
            ...(org.tools ?? {}),
          }
          const entries = Object.entries(bag).filter(([, n]) => n > 0)
          if (entries.length === 0) return null
          entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          return (
            <>
              <div className="org-detail-section">INVENTORY</div>
              <div className="relation-list">
                {entries.map(([kind, count]) => (
                  <Tooltip key={kind} tip={`${kind.replace(/_/g, ' ')} ×${count}`}>
                    <span
                      className="relation-tag"
                      style={{ background: '#0a1a1a', color: '#88e6d4', cursor: 'default' }}
                    >
                      {TOOL_ICON[kind] ?? '🧰'} {kind.replace(/_/g, ' ')} ×{count}
                    </span>
                  </Tooltip>
                ))}
              </div>
            </>
          )
        })()}

        {(org.religion_id ?? null) !== null && (
          <>
            <div className="org-detail-section">RELIGION</div>
            <div style={{ marginBottom: 4, fontSize: 11, color: '#bbb' }}>
              ✦ {religions?.find((r) => r.id === org.religion_id)?.name ?? org.religion_id}
            </div>
            {(org.piety ?? null) !== null && <Bar label="piety" value={org.piety ?? 0} color="#e6c488" />}
          </>
        )}

        {(org.diseases ?? []).length > 0 && (
          <>
            <div className="org-detail-section">DISEASES</div>
            <div className="relation-list">
              {(org.diseases ?? []).map((d, i) => (
                <Tooltip key={`${d.kind}-${i}`} tip={`Sick with ${d.kind} since t${d.started_tick}`}>
                  <span className="relation-tag enemy" style={{ cursor: 'default' }}>
                    🦠 {d.kind}
                  </span>
                </Tooltip>
              ))}
            </div>
          </>
        )}

        <div className="org-detail-section">MEMORY</div>
        <div className="org-memory" style={{ marginBottom: 6 }}>
          <Tooltip
            tip={`${org.memory_count?.food ?? 0} food tile locations remembered - organism navigates toward these when hungry`}
          >
            <span style={{ cursor: 'default' }}>food ×{org.memory_count?.food ?? 0}</span>
          </Tooltip>
          <Tooltip
            tip={`${org.memory_count?.water ?? 0} water source locations remembered - organism navigates toward these when thirsty`}
          >
            <span style={{ cursor: 'default' }}>water ×{org.memory_count?.water ?? 0}</span>
          </Tooltip>
          <Tooltip
            tip={`${org.memory_count?.danger ?? 0} danger zones remembered - organism avoids these areas when possible`}
          >
            <span style={{ cursor: 'default' }}>danger ×{org.memory_count?.danger ?? 0}</span>
          </Tooltip>
        </div>

        {history.length > 0 && (
          <>
            <div className="org-detail-section">RECENT LIFE</div>
            <div className="thought-history">
              {history.map((e, i) => (
                <div key={i} className="thought-row">
                  <span className="thought-tick">t{e.tick.toLocaleString()}</span>
                  <span className="thought-text">{e.text}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {witnessed.length > 0 && (
          <>
            <div className="org-detail-section">WHAT THEY'VE SEEN</div>
            <div className="thought-history">
              {witnessed.map((e, i) => (
                <div key={i} className="thought-row">
                  <span className="thought-tick">t{e.tick.toLocaleString()}</span>
                  <span className="thought-text" style={{ color: '#bfa9d6' }}>{e.text}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {detail?.memories && detail.memories.length > 0 && (
          <>
            <div className="org-detail-section">WHAT THEY REMEMBER</div>
            <div className="thought-history">
              {detail.memories.map((m, i) => {
                const kindColor: Record<string, string> = {
                  core: '#d8c060',
                  episode: '#bfa9d6',
                  fact: '#90c8b0',
                  bond: '#e09ab0',
                  place: '#a8c0e0',
                  dream: '#888',
                }
                const emoColor = m.emotion >= 2 ? '#f6c46a'
                  : m.emotion >= 1 ? '#d8c060'
                  : m.emotion <= -2 ? '#6090c0'
                  : m.emotion <= -1 ? '#80a8c0'
                  : '#d0c8c0'
                const bars = Math.max(1, Math.round(m.salience * 5))
                const relatedOrg = m.related_id ? organisms?.find((o) => o.id === m.related_id) : null
                return (
                  <div key={i} className="thought-row" style={{ alignItems: 'flex-start' }}>
                    <span
                      className="thought-tick"
                      style={{
                        color: kindColor[m.kind] ?? '#999',
                        fontWeight: 600,
                        minWidth: 56,
                      }}
                      title={`${m.kind} — salience ${(m.salience * 100).toFixed(0)}%${m.recalls > 0 ? ` · recalled ${m.recalls}x` : ''}`}
                    >
                      {m.kind}
                    </span>
                    <span className="thought-text" style={{ color: emoColor, flex: 1 }}>
                      {m.text}
                      {relatedOrg && (
                        <button
                          onClick={() => onSelectOrg?.(relatedOrg.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid #2a2520',
                            color: '#9ad0f0',
                            fontSize: 9,
                            padding: '1px 5px',
                            marginLeft: 6,
                            borderRadius: 3,
                            cursor: 'pointer',
                          }}
                          title={`Go to ${relatedOrg.name}`}
                        >
                          ↪ {relatedOrg.name}
                        </button>
                      )}
                    </span>
                    <span style={{ color: '#444', fontFamily: 'monospace', fontSize: 9, marginLeft: 6 }} title={`salience ${(m.salience * 100).toFixed(0)}%`}>
                      {'▮'.repeat(bars)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {detail?.vocabulary && Object.keys(detail.vocabulary).length > 0 && (
          <>
            <div className="org-detail-section">THEIR LANGUAGE</div>
            <div className="vocab-grid">
              {Object.entries(detail.vocabulary).map(([concept, word]) => (
                <div key={concept} className="vocab-row">
                  <span className="vocab-word">{word}</span>
                  <span className="vocab-concept">{concept}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {detail?.daily_story && (
          <>
            <div className="org-detail-section">TODAY'S STORY</div>
            <div className="daily-story">{detail.daily_story}</div>
          </>
        )}
      </div>
    </>
  )
}
