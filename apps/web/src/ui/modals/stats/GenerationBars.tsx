import { useMemo } from 'react'
import { generationCounts } from '../../../game/model/generation-counts'
import type { OrganismState } from '../../../shared/types'

/** How many living people there are in each generation, as bars. */
export function GenerationBars({ organisms }: { organisms: OrganismState[] }) {
  const rows = useMemo(() => generationCounts(organisms), [organisms])
  if (rows.length === 0) {
    return (
      <div style={{ color: '#444', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
        nobody is alive
      </div>
    )
  }
  const top = Math.max(...rows.map((r) => r.living))
  return (
    <div className="gen-bars" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {rows.map((r) => (
        <div key={r.generation} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 52, color: '#888' }}>gen {r.generation}</span>
          <span style={{ flex: 1, height: 8, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${(r.living / top) * 100}%`,
                background: '#8fd17a',
              }}
            />
          </span>
          <span style={{ width: 32, textAlign: 'right', color: '#bbb' }}>{r.living}</span>
        </div>
      ))}
    </div>
  )
}
