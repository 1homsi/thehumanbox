import { useState, useRef, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { ReactElement, ReactNode } from 'react'

const OFFSET = 8
const FLIP_PX = 80
const MAX_TOOLTIP_W = 320
const EDGE_PAD = 8
const LONG_PRESS_MS = 400

interface Props {
  tip: ReactNode
  children: ReactElement<Record<string, unknown>>
}

export function Tooltip({ tip, children }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const shownByLongPress = useRef(false)

  const show = (target: HTMLElement) => {
    setRect(target.getBoundingClientRect())
  }
  const hide = () => setRect(null)

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const endTouch = () => {
    clearLongPressTimer()
    if (shownByLongPress.current) {
      shownByLongPress.current = false
      hide()
    }
  }

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
    onClick: (e: React.MouseEvent) => {
      // A click often opens a modal above the trigger while the pointer is
      // still hovering it. Close the portal immediately so the old tooltip
      // never floats over the newly opened screen.
      hide()
      ;(children.props.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e)
    },
    // Touch/pen: long-press (>=400ms) reveals the tooltip. A short tap is
    // ignored here so the wrapped element's onClick fires normally without
    // a lingering tooltip from synthesized mouseenter on iOS.
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        const target = e.currentTarget as HTMLElement
        clearLongPressTimer()
        shownByLongPress.current = false
        longPressTimer.current = window.setTimeout(() => {
          longPressTimer.current = null
          shownByLongPress.current = true
          show(target)
        }, LONG_PRESS_MS)
      }
      ;(children.props.onPointerDown as ((e: React.PointerEvent) => void) | undefined)?.(e)
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') endTouch()
      ;(children.props.onPointerUp as ((e: React.PointerEvent) => void) | undefined)?.(e)
    },
    onPointerCancel: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') endTouch()
      ;(children.props.onPointerCancel as ((e: React.PointerEvent) => void) | undefined)?.(e)
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') endTouch()
      ;(children.props.onPointerLeave as ((e: React.PointerEvent) => void) | undefined)?.(e)
    },
  })

  const above = rect ? rect.top > FLIP_PX : true

  let clampedLeft = 0
  if (rect) {
    const ideal = rect.left + rect.width / 2
    const half = MAX_TOOLTIP_W / 2
    const minL = half + EDGE_PAD
    const maxL = window.innerWidth - half - EDGE_PAD
    clampedLeft = Math.min(Math.max(ideal, minL), maxL)
  }

  return (
    <>
      {child}
      {rect &&
        createPortal(
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
