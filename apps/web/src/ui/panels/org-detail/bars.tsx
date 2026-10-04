import { Tooltip } from '../../toolbar/Tooltip'
import { cbColor } from '../../../shared/constants'

export function Bar({ label, value, color }: { label: string; value: number; color: string }) {
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

export function MiniBar({
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
