import { memo, useMemo } from 'react'
import type { WorldState } from '../types'
import { useUIStore } from '../stores/store'
import { normalizeLineageEras } from '../utils/lineageEras'

interface Props {
  world: WorldState
}

function CivSummaryImpl({ world }: Props) {
  const openCiv = useUIStore((s) => s.openCiv)
  const lineageNames = world.lineage_names ?? {}
  const buildings = world.buildings ?? []
  const religions = world.religions ?? []
  const books = world.books ?? []
  const headlines = world.headlines ?? []

  const topEras = useMemo(() => {
    const eras = normalizeLineageEras(world.lineage_eras)
    const eraSummary: Record<string, number> = {}
    for (const era of Object.values(eras)) {
      eraSummary[era] = (eraSummary[era] ?? 0) + 1
    }
    return Object.entries(eraSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  }, [world.lineage_eras])
  const buildingTotal = buildings.length

  const recentLines = headlines.slice(0, 3)

  if (
    topEras.length === 0 &&
    buildingTotal === 0 &&
    religions.length === 0 &&
    books.length === 0 &&
    !world.cosmos
  ) {
    return null
  }

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
    <div className="civ-summary">
      <div className="section-title">CIVILIZATION</div>
      {world.cosmos && (
        <div className="civ-summary-row" style={{ marginBottom: 4 }}>
          <span
            className="civ-summary-chip"
            title={`Year ${world.cosmos.year} · day ${world.cosmos.day_of_year}`}
          >
            year {world.cosmos.year}
          </span>
          <span className="civ-summary-chip" title={`Moon: ${world.cosmos.moon_phase.replace(/_/g, ' ')}`}>
            {moonGlyphs[world.cosmos.moon_phase] ?? '🌑'} {world.cosmos.moon_phase.replace(/_/g, ' ')}
          </span>
        </div>
      )}
      {topEras.length > 0 && (
        <div className="civ-summary-row">
          {topEras.map(([era, n]) => (
            <span key={era} className="civ-summary-chip">
              {era} · {n}
            </span>
          ))}
        </div>
      )}
      <div className="civ-summary-stats">
        {buildingTotal > 0 && (
          <span>
            <strong>{buildingTotal}</strong> bldgs
          </span>
        )}
        {religions.length > 0 && (
          <span>
            <strong>{religions.length}</strong> faiths
          </span>
        )}
        {books.length > 0 && (
          <span>
            <strong>{books.length}</strong> books
          </span>
        )}
      </div>
      {recentLines.length > 0 && (
        <div className="civ-summary-headlines">
          {recentLines.map((h, i) => {
            const tickStr = String(h.tick)
            return (
              <div key={`${tickStr}-${i}`} className="civ-summary-headline">
                {h.text}
              </div>
            )
          })}
        </div>
      )}
      <button className="civ-summary-btn" onClick={openCiv}>
        view all
      </button>
      {/* lineageNames intentionally read so an unused-import isn't created when the field is absent. */}
      <span hidden>{Object.keys(lineageNames).length}</span>
    </div>
  )
}

export const CivSummary = memo(CivSummaryImpl)
