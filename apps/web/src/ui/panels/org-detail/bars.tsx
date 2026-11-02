import { useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '../../toolbar/Tooltip'
import { cbColor } from '../../../shared/constants'

/** Whether the element's text is cut off, kept current as it is resized. */
function useTruncated<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCut(el.scrollWidth > el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])
  return [ref, cut] as const
}

export function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  // The full word only when it does not fit: on hover, keyboard focus or a long press (see Tooltip).
  const [labelRef, cut] = useTruncated<HTMLSpanElement>(label)
  return (
    <div className="bar-row">
      <Tooltip tip={cut ? label : null}>
        <span ref={labelRef} className="bar-label bar-label-word" tabIndex={cut ? 0 : undefined}>
          {label}
        </span>
      </Tooltip>
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
  valueLabel,
}: {
  label: string
  value: number
  color: string
  invert?: boolean
  tip?: string
  /** Shown instead of the percentage, e.g. a rank. */
  valueLabel?: string
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
      <span className={valueLabel ? 'bar-pct bar-pct-word' : 'bar-pct'}>
        {valueLabel ?? (value * 100).toFixed(0)}
      </span>
    </div>
  )
}
