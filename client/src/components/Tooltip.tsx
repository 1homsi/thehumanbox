import { useState, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement, ReactNode } from 'react'

interface Props {
  tip: ReactNode
  children: ReactElement
}

export function Tooltip({ tip, children }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  const child = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      setRect((e.currentTarget as HTMLElement).getBoundingClientRect())
      children.props.onMouseEnter?.(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setRect(null)
      children.props.onMouseLeave?.(e)
    },
  })

  return (
    <>
      {child}
      {rect && createPortal(
        <div
          className="ui-tooltip"
          style={{ left: rect.left + rect.width / 2, top: rect.top - 8 }}
        >
          {tip}
          <div className="ui-tooltip-arrow" />
        </div>,
        document.body,
      )}
    </>
  )
}
