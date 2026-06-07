import type { WorldState } from '../types'
import { Modal } from './Modal'
import { normalizeLineageEras } from '../utils/lineageEras'
import { useSceneStore } from '../stores/scene'

interface Props {
  world: WorldState
  onClose: () => void
}

const ERA_EMOJI: Record<string, string> = {
  'pre-stone': '\u{1F33F}',
  stone: '\u{1FAA8}',
  bronze: '\u{1F33E}',
  iron: '\u{2694}\u{FE0F}',
  classical: '\u{1F3DB}\u{FE0F}',
  medieval: '\u{1F3F0}',
  renaissance: '\u{1F3A8}',
  industrial: '\u{1F3ED}',
  modern: '\u{1F697}',
  information: '\u{1F4BB}',
}

const GOV_EMOJI: Record<string, string> = {
  tribal: '\u{1F525}',
  chiefdom: '\u{1FAA9}',
  monarchy: '\u{1F451}',
  theocracy: '\u{271D}\u{FE0F}',
  republic: '\u{1F3DB}\u{FE0F}',
  democracy: '\u{1F5F3}\u{FE0F}',
  empire: '\u{1F985}',
  federation: '\u{1F30E}',
  corporate: '\u{1F3E2}',
}

const GOOD_EMOJI: Record<string, string> = {
  food: '\u{1F35E}',
  water: '\u{1F4A7}',
  wood: '\u{1FAB5}',
  stone: '\u{1FAA8}',
  iron: '\u{1F528}',
  cloth: '\u{1F9F5}',
  bread: '\u{1F35E}',
  spirit: '\u{1F943}',
  aged_spirit: '\u{1F6E2}\u{FE0F}',
  bottled_spirit: '\u{1F37E}',
  blended_spirit: '\u{1F377}',
  bottle: '\u{1F376}',
  meat: '\u{1F969}',
  cuts: '\u{1F52A}',
  ground: '\u{1F356}',
  sausage: '\u{1F32D}',
  preserved: '\u{1F9C2}',
  preserved_meat: '\u{1F9C2}',
  pattern: '\u{1F4D0}',
  piece: '\u{1F9F5}',
  garment: '\u{1F455}',
  article: '\u{1F4F0}',
  drink: '\u{1F375}',
  pastry: '\u{1F950}',
  coffee: '\u{2615}',
  stock: '\u{1F4E6}',
}

const ART_EMOJI: Record<string, string> = {
  cave_painting: '\u{1F58C}\u{FE0F}',
  sculpture: '\u{1F5FF}',
  fresco: '\u{1F3DB}\u{FE0F}',
  painting: '\u{1F5BC}\u{FE0F}',
  photograph: '\u{1F4F7}',
  film: '\u{1F3AC}',
  digital: '\u{1F5A5}\u{FE0F}',
}

export function CivStatsModal({ world, onClose }: Props) {
  const lineages = world.lineage_sizes ?? []
  const lineageNames = world.lineage_names ?? {}
  const lineageEras = normalizeLineageEras(world.lineage_eras)
  const currencies = (world.lineage_currencies ?? {}) as Record<string, string>
  const governments =
    (
      world as unknown as {
        governments?: Array<{
          lineage_id: string
          kind: string
          leader_id?: string | null
          treasury?: number
          laws?: string[]
        }>
      }
    ).governments ?? []
  const religions = world.religions ?? []
  const books = world.books ?? []
  const artworks =
    (
      world as unknown as {
        artworks?: Array<{
          id: number
          kind: string
          title: string
          creator_name: string
        }>
      }
    ).artworks ?? []
  const headlines = world.headlines ?? []

  const lineageById = (lid: string) => lineageNames[lid] ?? lid.slice(0, 6)
  const orgById = (id: string | null | undefined) => {
    if (!id) return null
    return world.organisms.find((o) => o.id === id)?.name ?? id.slice(0, 6)
  }

  const buildingCounts: Record<string, number> = {}
  for (const b of world.buildings ?? []) {
    buildingCounts[b.kind] = (buildingCounts[b.kind] ?? 0) + 1
  }
  const buildingRows = Object.entries(buildingCounts).sort((a, b) => b[1] - a[1])

  const goodsByLineage = new Map<string, Map<string, number>>()
  for (const o of world.organisms) {
    if (!o.alive || !o.tools) continue
    const lid = o.lineage_id
    let bag = goodsByLineage.get(lid)
    if (!bag) {
      bag = new Map<string, number>()
      goodsByLineage.set(lid, bag)
    }
    for (const [k, v] of Object.entries(o.tools)) {
      if (!v) continue
      bag.set(k, (bag.get(k) ?? 0) + v)
    }
  }
  const goodsTotals = new Map<string, number>()
  for (const bag of goodsByLineage.values()) {
    for (const [k, v] of bag) {
      goodsTotals.set(k, (goodsTotals.get(k) ?? 0) + v)
    }
  }
  const goodsTotalRows = [...goodsTotals.entries()].sort((a, b) => b[1] - a[1])

  const moonGlyphs: Record<string, string> = {
    new_moon: '🌑',
    waxing_crescent: '🌒',
    first_quarter: '🌓',
    waxing_gibbous: '🌔',
    full_moon: '🌕',
    waning_gibbous: '🌖',
    last_quarter: '🌗',
    waning_crescent: '🌘',
  }

  return (
    <Modal open onClose={onClose} className="civ-modal" title={'\u{1F30D} Civilization'}>
      {world.cosmos && (
        <div className="civ-calendar">
          <div className="civ-cal-item">
            <span className="civ-cal-label">year</span>
            <span className="civ-cal-value">{world.cosmos.year}</span>
            <span className="civ-cal-sub">day {world.cosmos.day_of_year} of 84</span>
          </div>
          <span className="civ-cal-sep" aria-hidden="true" />
          <div className="civ-cal-item">
            <span className="civ-cal-moon">{moonGlyphs[world.cosmos.moon_phase] ?? '🌑'}</span>
            <span className="civ-cal-value">{world.cosmos.moon_phase.replace(/_/g, ' ')}</span>
            <span className="civ-cal-sub">{Math.round(world.cosmos.moon_illum * 100)}% lit</span>
          </div>
          <span className="civ-cal-sep" aria-hidden="true" />
          <div className="civ-cal-item">
            <span className="civ-cal-label">season</span>
            <span className="civ-cal-value">{world.season}</span>
          </div>
          {world.current_era && (
            <>
              <span className="civ-cal-sep" aria-hidden="true" />
              <div className="civ-cal-item">
                <span className="civ-cal-label">world tech</span>
                <span className="civ-cal-value">{world.current_era}</span>
              </div>
            </>
          )}
        </div>
      )}
      <div className="civ-modal-grid">
        <div className="civ-cols">
          <section className="civ-section">
            <h3>Lineages</h3>
            <table className="civ-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Lineage Era</th>
                  <th>Pop</th>
                  <th>Gov</th>
                  <th>Currency</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineages.slice(0, 12).map((l) => {
                  const era = lineageEras[l.id] ?? 'pre-stone'
                  const gov = governments.find((g) => g.lineage_id === l.id)
                  const hasBrewing = world.organisms.some(
                    (o) => o.alive && o.lineage_id === l.id && o.discoveries.includes('brewing'),
                  )
                  return (
                    <tr key={l.id}>
                      <td>{lineageById(l.id)}</td>
                      <td>
                        {ERA_EMOJI[era] ?? ''} {era}
                      </td>
                      <td>{l.count}</td>
                      <td>{gov ? `${GOV_EMOJI[gov.kind] ?? ''} ${gov.kind}` : '-'}</td>
                      <td>{currencies[l.id] ?? '-'}</td>
                      <td>
                        {hasBrewing && (
                          <button
                            className="civ-row-link"
                            onClick={() => {
                              useSceneStore.getState().enter({ kind: 'tavern', lineageId: l.id })
                              onClose()
                            }}
                          >
                            🍻 tavern
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="civ-section">
            <h3>Governments &amp; Leaders</h3>
            {governments.length === 0 && <div className="civ-empty">No governments yet</div>}
            {governments.map((g) => (
              <div key={g.lineage_id} className="civ-row">
                <span className="civ-row-head">
                  {GOV_EMOJI[g.kind] ?? ''} {g.kind}
                </span>
                <span className="civ-row-sub">{lineageById(g.lineage_id)}</span>
                {g.leader_id && <span className="civ-row-tag">leader: {orgById(g.leader_id)}</span>}
                {typeof g.treasury === 'number' && (
                  <span className="civ-row-tag">treasury: {g.treasury}</span>
                )}
                {g.laws && g.laws.length > 0 && (
                  <div className="civ-row-laws">
                    {g.laws.map((l) => (
                      <span key={l} className="civ-chip">
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>Religions</h3>
            {religions.length === 0 && <div className="civ-empty">No religions founded yet</div>}
            {religions.map((r) => (
              <div key={r.id} className="civ-row">
                <span className="civ-row-head">
                  {'\u{271D}\u{FE0F}'} {r.name}
                </span>
                <span className="civ-row-sub">{r.kind}</span>
                <span className="civ-row-tag">{r.adherents} adherents</span>
                <span className="civ-row-tag">
                  founded by {lineageById(r.founder_lineage ?? r.lineage_id ?? '')}
                </span>
                <button
                  className="civ-row-link"
                  onClick={() => {
                    useSceneStore.getState().enter({ kind: 'temple', religionId: r.id })
                    onClose()
                  }}
                >
                  enter temple →
                </button>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>Buildings</h3>
            {buildingRows.length === 0 && <div className="civ-empty">Nothing built yet</div>}
            <div className="civ-build-grid">
              {buildingRows.map(([kind, count]) => (
                <span key={kind} className="civ-chip">
                  {kind}: {count}
                </span>
              ))}
            </div>
          </section>

          <section className="civ-section">
            <h3>Goods in Circulation</h3>
            {goodsTotalRows.length === 0 && <div className="civ-empty">No crafted goods held yet</div>}
            <div className="civ-build-grid">
              {goodsTotalRows.map(([kind, total]) => (
                <span key={kind} className="civ-chip" title={kind.replace(/_/g, ' ')}>
                  {GOOD_EMOJI[kind] ?? '🧰'} {kind.replace(/_/g, ' ')}: {total}
                </span>
              ))}
            </div>
            {goodsTotalRows.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                by lineage:
                <div style={{ marginTop: 4 }}>
                  {[...goodsByLineage.entries()]
                    .sort((a, b) => {
                      const sa = [...a[1].values()].reduce((s, v) => s + v, 0)
                      const sb = [...b[1].values()].reduce((s, v) => s + v, 0)
                      return sb - sa
                    })
                    .slice(0, 6)
                    .map(([lid, bag]) => {
                      const lname = lineageById(lid)
                      const total = [...bag.values()].reduce((s, v) => s + v, 0)
                      const top = [...bag.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([k, n]) => `${GOOD_EMOJI[k] ?? ''}${n}`)
                        .join(' ')
                      return (
                        <div key={lid} className="civ-row" style={{ padding: '2px 0' }}>
                          <span className="civ-row-head">{lname}</span>
                          <span className="civ-row-tag">{total} held</span>
                          <span className="civ-row-sub">{top}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </section>

          <section className="civ-section">
            <h3>Recent Books</h3>
            {books.length === 0 && <div className="civ-empty">No books written yet</div>}
            {books.slice(0, 10).map((b) => (
              <div key={b.id} className="civ-row">
                <span className="civ-row-head">
                  {'\u{1F4D6}'} {b.title}
                </span>
                <span className="civ-row-sub">
                  {b.author_name} on {b.topic}
                </span>
                <span className="civ-row-tag">{b.copies} copies</span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>Artworks</h3>
            {artworks.length === 0 && <div className="civ-empty">Nothing made yet</div>}
            {artworks.slice(0, 10).map((a) => (
              <div key={a.id} className="civ-row">
                <span className="civ-row-head">
                  {ART_EMOJI[a.kind] ?? ''} {a.title}
                </span>
                <span className="civ-row-sub">by {a.creator_name}</span>
              </div>
            ))}
          </section>

          <section className="civ-section">
            <h3>Recent Trades</h3>
            {(() => {
              const trades = world.trades ?? []
              if (trades.length === 0) {
                return <div className="civ-empty">No trades yet (needs barter / currency)</div>
              }
              const nameById = new Map<string, string>()
              for (const o of world.organisms) nameById.set(o.id, o.name)
              return trades.slice(0, 10).map((t, i) => {
                const buyer = nameById.get(t.buyer_id) ?? t.buyer_id.slice(0, 6)
                const seller = nameById.get(t.seller_id) ?? t.seller_id.slice(0, 6)
                return (
                  <div key={`${t.tick}-${i}`} className="civ-row">
                    <span className="civ-row-head">
                      {'\u{1F4B0}'} {seller} → {buyer}
                    </span>
                    <span className="civ-row-sub">
                      {GOOD_EMOJI[t.good] ?? ''} {t.amount} {t.good.replace(/_/g, ' ')}
                    </span>
                    <span className="civ-row-tag">
                      {t.price} coin{t.price === 1 ? '' : 's'}
                    </span>
                    <span className="civ-row-tag">tick {t.tick}</span>
                  </div>
                )
              })
            })()}
          </section>

          <section className="civ-section">
            <h3>Headlines</h3>
            {headlines.length === 0 && <div className="civ-empty">No notable events yet</div>}
            {headlines.slice(0, 12).map((h, i) => (
              <div key={`${h.tick}-${i}`} className="civ-headline">
                <span className="civ-headline-tick">tick {h.tick}</span>
                <span className="civ-headline-text">{h.text}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </Modal>
  )
}
