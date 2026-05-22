import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  className?: string
  title?: string
  hideTitle?: boolean
  children: ReactNode
}

export function Modal({ open, onClose, className, title, hideTitle = false, children }: ModalProps) {
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
          className={className}
          aria-describedby={undefined}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 101,
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
          }}
        >
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
