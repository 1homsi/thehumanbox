import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import './modal-theme.css'
import { registerOpenSheet } from './openSheets'

interface ModalProps {
  open: boolean
  onClose: () => void
  className?: string
  title?: string
  hideTitle?: boolean
  children: ReactNode
}

/** How far a phone sheet must be dragged down (CSS px) for letting go to dismiss it. */
const DISMISS_DRAG_PX = 90

export function Modal({ open, onClose, className, title, hideTitle = false, children }: ModalProps) {
  // Confirmations stay a centred dialog on phones; everything else is a bottom sheet there.
  const sheet = !className?.includes('confirm-modal')
  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; startY: number; dy: number } | null>(null)

  // A mounted sheet covers most of a phone map; the renderer can stop drawing behind it.
  useEffect(() => {
    if (!sheet || !open) return
    return registerOpenSheet()
  }, [open, sheet])

  // The grabber only exists on phones (see modal-theme.css): drag the sheet down to dismiss it.
  const onGrabStart = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, startY: e.clientY, dy: 0 }
    if (contentRef.current) contentRef.current.style.transition = 'none'
  }
  const onGrabMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !contentRef.current) return
    d.dy = Math.max(0, e.clientY - d.startY)
    contentRef.current.style.transform = `translateY(${d.dy}px)`
  }
  const resetGrab = (e?: PointerEvent<HTMLDivElement>) => {
    if (e && drag.current?.id !== e.pointerId) return
    const d = drag.current
    drag.current = null
    const el = contentRef.current
    if (!d || !el) return
    el.style.transition = ''
    el.style.transform = ''
  }
  const onGrabEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (d.dy > DISMISS_DRAG_PX) {
      drag.current = null
      onClose()
      return
    }
    resetGrab()
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="lang-modal-backdrop" />
        <Dialog.Content
          ref={contentRef}
          className={`thb-modal${sheet ? ' thb-modal--sheet' : ''} ${className ?? ''}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
          }}
        >
          {sheet && (
            <div
              className="thb-modal-grabber"
              aria-hidden="true"
              onPointerDown={onGrabStart}
              onPointerMove={onGrabMove}
              onPointerUp={onGrabEnd}
              onPointerCancel={resetGrab}
            />
          )}
          {title &&
            (hideTitle ? (
              <Dialog.Title
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0 0 0 0)',
                }}
              >
                {title}
              </Dialog.Title>
            ) : (
              <Dialog.Title>{title}</Dialog.Title>
            ))}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
