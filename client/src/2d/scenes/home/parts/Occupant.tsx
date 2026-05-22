import type { SceneOccupant } from '../../../../scenes/core/types'
import { lineageColor } from '../../../../utils/constants'

interface Props {
  occupant: SceneOccupant
  x: number
  y: number
  selected: boolean
  onClick: () => void
}

export function Occupant({ occupant, x, y, selected, onClick }: Props) {
  const { org, role, activity } = occupant
  const color = lineageColor(org.lineage_id)
  const sex = org.sex ?? 'male'
  const age = org.age_stage ?? 'adult'
  const isChild = age === 'infant' || age === 'child'
  const scale = age === 'infant' ? 0.55 : age === 'child' ? 0.75 : age === 'elder' ? 0.95 : 1.0
  const skin = sex === 'female' ? '#e8c9a8' : '#d9b48a'

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {selected && (
        <circle cx="0" cy="4" r="11" fill="none" stroke="#ffe066" strokeWidth="1.5" strokeDasharray="3 2">
          <animate attributeName="stroke-dashoffset" values="0;-10" dur="1s" repeatCount="indefinite" />
        </circle>
      )}
      <ellipse cx="0" cy="9" rx="6" ry="1.5" fill="rgba(0,0,0,0.30)" />
      <rect x="-3.5" y="-2" width="7" height="9" fill={color} rx="1" />
      <circle cx="0" cy="-4" r="3.5" fill={skin} stroke="#3a2618" strokeWidth="0.4" />
      {sex === 'female' && (
        <path d={`M -3.5 -5 Q 0 -8 3.5 -5 L 3.5 -3 L -3.5 -3 Z`} fill="#3a2618" opacity="0.7" />
      )}
      {sex === 'male' && <path d={`M -3 -6 Q 0 -7 3 -6 L 3 -4 L -3 -4 Z`} fill="#3a2618" opacity="0.7" />}
      {org.is_elder && <line x1="4" y1="2" x2="6" y2="9" stroke="#aa9070" strokeWidth="0.6" />}
      {isChild && <circle cx="0" cy="0" r="0" fill="none" />}
      {role === 'host' && (
        <text
          x="0"
          y="-10"
          textAnchor="middle"
          fontSize="3.2"
          fill="#ffe066"
          style={{ fontWeight: 700, letterSpacing: 0.2, pointerEvents: 'none' }}
        >
          ★
        </text>
      )}
      <text
        x="0"
        y="14"
        textAnchor="middle"
        fontSize="3.5"
        fill="#e5ddc7"
        style={{ pointerEvents: 'none', fontFamily: 'monospace' }}
      >
        {org.name}
      </text>
      {activity && (
        <text
          x="0"
          y="19"
          textAnchor="middle"
          fontSize="2.6"
          fill="#9b9180"
          style={{ pointerEvents: 'none', fontStyle: 'italic', fontFamily: 'monospace' }}
        >
          {activity.length > 24 ? activity.slice(0, 23) + '…' : activity}
        </text>
      )}
    </g>
  )
}
