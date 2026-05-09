import { useState, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { ReactElement, ReactNode } from 'react'

const OFFSET = 8
// Flip to below when less than this many px from the top of the viewport
const FLIP_PX = 80
const MAX_TOOLTIP_W = 320
const EDGE_PAD = 8

interface Props {
  tip: ReactNode
  children: ReactElement<Record<string, unknown>>
}

export function Tooltip({ tip, children }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  const child = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      setRect((e.currentTarget as HTMLElement).getBoundingClientRect())
      ;(children.props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setRect(null)
      ;(children.props.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e)
    },
  })

  const above = rect ? rect.top > FLIP_PX : true

  let clampedLeft = 0
  if (rect) {
    const ideal = rect.left + rect.width / 2
    const half  = MAX_TOOLTIP_W / 2
    const minL  = half + EDGE_PAD
    const maxL  = window.innerWidth - half - EDGE_PAD
    clampedLeft = Math.min(Math.max(ideal, minL), maxL)
  }

  return (
    <>
      {child}
      {rect && createPortal(
        <div
          className={clsx('ui-tooltip', above ? 'ui-tooltip--above' : 'ui-tooltip--below')}
          style={{
            left: clampedLeft,
            top: above ? rect.top - OFFSET : rect.bottom + OFFSET,
          }}
        >
          {tip}
          <div className="ui-tooltip-arrow" />
        </div>,
        document.body,
      )}
    </>
  )
}
