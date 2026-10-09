import { useMemo } from 'react'
import { legendsOf } from '../../../game/model/legends'
import type { SimEvent } from '../../../shared/types'

/** The world's latest notable events, told as titled legends with their date. */
export function LegendsList({ events }: { events: SimEvent[] }) {
  const legends = useMemo(() => legendsOf(events), [events])
  if (legends.length === 0) {
    return (
      <div style={{ color: '#444', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
        no legends yet
      </div>
    )
  }
  return (
    <ul className="legends-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {legends.map((l) => (
        <li key={`${l.tick}-${l.title}-${l.text}`} style={{ fontSize: 11, padding: '3px 0' }}>
          <span style={{ color: '#e8c46a' }}>{l.title}</span>
          <span style={{ color: '#777' }}> · {l.when}</span>
          <div style={{ color: '#bbb' }}>{l.text}</div>
        </li>
      ))}
    </ul>
  )
}
