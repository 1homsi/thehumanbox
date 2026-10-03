import { icons } from './tool-sprites/icons'
import { palette, sprites } from './tool-sprites'

const viewBoxes = new Map<string, string>()

/**
 * Sprites are drawn on a 12x12 grid but rarely fill it evenly, so the view
 * box is centred on each sprite's painted pixels. That keeps every sprite
 * optically centred in its tile without hand-tuning the artwork.
 */
function centredViewBox(name: string, rows: readonly string[]): string {
  const cached = viewBoxes.get(name)
  if (cached) return cached
  let minX = 12
  let maxX = -1
  let minY = rows.length
  let maxY = -1
  rows.forEach((row, y) => {
    ;[...row].forEach((pixel, x) => {
      if (pixel === '.') return
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    })
  })
  const box = maxX < 0 ? '0 0 12 12' : `${(minX + maxX + 1) / 2 - 6} ${(minY + maxY + 1) / 2 - 6} 12 12`
  viewBoxes.set(name, box)
  return box
}

export function ToolSprite({ icon, size = 24 }: { icon: string; size?: number }) {
  const name = icons[icon] ?? 'cursor'
  const rows = sprites[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox={centredViewBox(name, rows)}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {rows.flatMap((row, y) =>
        [...row].flatMap((pixel, x) =>
          pixel === '.'
            ? []
            : [<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={palette[pixel]} />],
        ),
      )}
    </svg>
  )
}
