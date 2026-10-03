import { memo, type ReactElement } from 'react'

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

// The pixel rects for a sprite never change, but the toolbar and header re-render
// on every world frame. Building ~100 <rect> elements per icon per render
// dominated the live app's React time, so each sprite's element list is built once
// and reused (React skips diffing children that are the same element objects).
const spriteRects = new Map<string, ReactElement[]>()

function rectsFor(name: string, rows: readonly string[]): ReactElement[] {
  let rects = spriteRects.get(name)
  if (!rects) {
    rects = rows.flatMap((row, y) =>
      [...row].flatMap((pixel, x) =>
        pixel === '.'
          ? []
          : [<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={palette[pixel]} />],
      ),
    )
    spriteRects.set(name, rects)
  }
  return rects
}

const SPRITE_STYLE = { display: 'block', flexShrink: 0 } as const

export const ToolSprite = memo(function ToolSprite({ icon, size = 24 }: { icon: string; size?: number }) {
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
      style={SPRITE_STYLE}
    >
      {rectsFor(name, rows)}
    </svg>
  )
})
