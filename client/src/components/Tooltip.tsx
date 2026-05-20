import { useState, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { ReactElement, ReactNode } from 'react'

const OFFSET = 8
const FLIP_PX = 80
const MAX_TOOLTIP_W = 320
const EDGE_PAD = 8

interface Props {
  tip: ReactNode
  children: ReactElement<Record<string, unknown>>
}

export function Tooltip({ tip, children }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  const show = (target: HTMLElement) => {
    setRect(target.getBoundingClientRect())
  }
  const hide = () => setRect(null)

  const child = cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      show(e.currentTarget as HTMLElement)
      ;(children.props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide()
      ;(children.props.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e)
    },
    onFocus: (e: React.FocusEvent) => {
      show(e.currentTarget as HTMLElement)
      ;(children.props.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e)
    },
    onBlur: (e: React.FocusEvent) => {
      hide()
      ;(children.props.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e)
    },
    // Touch: tap shows the tooltip for ~2s, tap again hides immediately.
    onTouchStart: (e: React.TouchEvent) => {
      show(e.currentTarget as HTMLElement)
      window.setTimeout(hide, 2200)
      ;(children.props.onTouchStart as ((e: React.TouchEvent) => void) | undefined)?.(e)
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
