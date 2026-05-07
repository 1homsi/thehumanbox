import { useState, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement, ReactNode } from 'react'

const OFFSET = 8
// Flip to below when less than this many px from the top of the viewport
const FLIP_PX = 80

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

  return (
    <>
      {child}
      {rect && createPortal(
        <div
          className={`ui-tooltip ui-tooltip--${above ? 'above' : 'below'}`}
          style={{
            left: rect.left + rect.width / 2,
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
