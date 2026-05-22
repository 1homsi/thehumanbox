import type { WorldState } from '../types'
import { useUIStore } from '../stores/store'
import { normalizeLineageEras } from '../utils/lineageEras'

interface Props {
  world: WorldState
}

export function CivSummary({ world }: Props) {
  const openCiv = useUIStore((s) => s.openCiv)
  const lineageEras = normalizeLineageEras(world.lineage_eras)
  const lineageNames = world.lineage_names ?? {}
  const buildings = world.buildings ?? []
  const religions = world.religions ?? []
  const books = world.books ?? []
  const headlines = world.headlines ?? []

  const eraSummary: Record<string, number> = {}
  for (const era of Object.values(lineageEras)) {
    eraSummary[era] = (eraSummary[era] ?? 0) + 1
  }
  const topEras = Object.entries(eraSummary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  const buildingTotal = buildings.length

  const recentLines = headlines.slice(0, 3)

  if (topEras.length === 0 && buildingTotal === 0 && religions.length === 0 && books.length === 0) {
    return null
  }

  return (
    <div className="civ-summary">
      <div className="section-title">CIVILIZATION</div>
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
