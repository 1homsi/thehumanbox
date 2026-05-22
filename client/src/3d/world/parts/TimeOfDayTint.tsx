import { useMemo } from 'react'

interface Props {
  dayProgress: number
  weatherKind?: string
}

export function TimeOfDayTint({ dayProgress, weatherKind = 'clear' }: Props) {
  const { color, opacity } = useMemo(() => {
    let color: string
    let opacity: number
    if (dayProgress < 0.20 || dayProgress > 0.80) {
      color = '#1a2050'
      opacity = 0.32
    } else if (dayProgress < 0.32) {
      const t = (dayProgress - 0.20) / 0.12
      const fade = 1 - t
      color = '#ff8a3a'
      opacity = 0.05 + fade * 0.18
    } else if (dayProgress < 0.68) {
      opacity = 0
      color = 'rgba(0,0,0,0)'
    } else {
      const t = (dayProgress - 0.68) / 0.12
      const fade = t
      color = '#ff6028'
      opacity = 0.05 + fade * 0.18
    }
    if (weatherKind === 'storm') {
      color = '#3a4258'
      opacity = Math.max(opacity, 0.22)
    } else if (weatherKind === 'rain') {
      color = '#56607a'
      opacity = Math.max(opacity, 0.14)
    }
    return { color, opacity }
  }, [dayProgress, weatherKind])

  if (opacity <= 0.01) return null
  return (
    <div
      className="thb-3d-tint"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: color,
        opacity,
        mixBlendMode: 'overlay',
        zIndex: 3,
      }}
    />
  )
}
