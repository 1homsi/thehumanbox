/**
 * Themed stand-ins for `window.confirm` and `window.alert`, which render as
 * the browser's own dialogs. `ConfirmHost` (mounted once in App) shows them.
 */
export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive. */
  danger?: boolean
  /** A notice with a single dismiss button instead of a question. */
  notice?: boolean
}

export interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

let pending: PendingConfirm | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Resolves true when the player confirms, false when they cancel or close the dialog. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  // Only one dialog at a time; a newer one dismisses the older.
  pending?.resolve(false)
  return new Promise((resolve) => {
    pending = { ...options, resolve }
    emit()
  })
}

/** Shows a message with one dismiss button. */
export function showNotice(title: string, body?: string): Promise<void> {
  return askConfirm({ title, body, notice: true, confirmLabel: 'ok' }).then(() => undefined)
}

export function settleConfirm(ok: boolean) {
  const current = pending
  pending = null
  emit()
  current?.resolve(ok)
}

export function subscribeConfirm(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function currentConfirm(): PendingConfirm | null {
  return pending
}
