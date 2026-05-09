import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

interface ModalProps {
  open:    boolean
  onClose: () => void
  /** Class name applied to the inner panel - pick the existing CSS class
   *  used by each modal (e.g. `cv-modal`, `lang-modal`). */
  className?: string
  /** Required for accessibility - used by screen readers, also visible
   *  if the modal renders its own header you can pass empty and rely on
   *  aria-label via labelledBy. */
  title?:   string
  /** Visually hide the title (still announced to screen readers). Useful
   *  when the modal renders its own custom header. */
  hideTitle?: boolean
  children:   ReactNode
}

/**
 * Single Modal wrapper used by every modal in the app.
 *
 * Built on Radix Dialog primitives so we get for free:
 *   - Focus trap (Tab/Shift+Tab cycle inside the modal)
 *   - ESC to close
 *   - Click-outside to close
 *   - Body scroll lock while open
 *   - Portal rendering (modal markup lives outside App tree, so App
 *     re-renders don't reconcile the modal subtree)
 *   - ARIA roles + labelling for screen readers
 *
 * Visual styling is unchanged - pass the same `className` the existing
 * hand-rolled modals used (e.g. `cv-modal`, `stats-modal`) and the CSS
 * keeps applying. The Radix Overlay reuses the existing
 * `.lang-modal-backdrop` class for the dimmed background.
 */
export function Modal({ open, onClose, className, title, hideTitle = false, children }: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => { if (!next) onClose() }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="lang-modal-backdrop" />
        <Dialog.Content
          className={className}
          // Radix renders Overlay and Content as siblings inside the portal,
          // so the old "flex-center children" rule on .lang-modal-backdrop
          // doesn't reach the panel anymore. Position Content directly with
          // a fixed-centered transform - works for any modal width/height,
          // including the panel CSS classes that previously relied on
          // backdrop flex centering.
          style={{
            position: 'fixed',
            top:      '50%',
            left:     '50%',
            transform: 'translate(-50%, -50%)',
            zIndex:    101,
          }}
          onOpenAutoFocus={(e) => {
            // Don't grab focus on the first focusable element by default -
            // many of our modals have non-essential buttons in the header
            // (close, etc.) and stealing focus there is jarring.
            e.preventDefault()
          }}
        >
          {title && (
            hideTitle
              ? <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{title}</Dialog.Title>
              : <Dialog.Title>{title}</Dialog.Title>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
