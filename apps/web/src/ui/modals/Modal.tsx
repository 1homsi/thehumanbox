import * as Dialog from '@radix-ui/react-dialog'
import { useRef, type PointerEvent, type ReactNode } from 'react'
import './modal-theme.css'

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
  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; dy: number } | null>(null)

  // The grabber only exists on phones (see modal-theme.css): drag the sheet down to dismiss it.
  const onGrabStart = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, dy: 0 }
    if (contentRef.current) contentRef.current.style.transition = 'none'
  }
  const onGrabMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !contentRef.current) return
    d.dy = Math.max(0, e.clientY - d.startY)
    contentRef.current.style.transform = `translateY(${d.dy}px)`
  }
  const onGrabEnd = () => {
    const d = drag.current
    drag.current = null
    const el = contentRef.current
    if (!d || !el) return
    if (d.dy > DISMISS_DRAG_PX) {
      onClose()
      return
    }
    el.style.transition = ''
    el.style.transform = ''
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
          className={`thb-modal ${className ?? ''}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
          }}
        >
          <div
            className="thb-modal-grabber"
            aria-hidden="true"
            onPointerDown={onGrabStart}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabEnd}
            onPointerCancel={onGrabEnd}
          />
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
