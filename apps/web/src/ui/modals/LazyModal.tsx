import { Suspense, type ComponentProps } from 'react'
import { lazyWithRetry } from '../../shared/lazyWithRetry'

// The dialogs that ship in the first download (the confirm host and the silent-world
// notice) are rarely open, and `Modal` is the only thing that pulls Radix Dialog (about
// 40 kB) into it. They use this wrapper instead, which fetches `Modal` on first use;
// the chunk is prefetched shortly after startup so a dialog opened later is not delayed.
// The dialog stylesheet is imported eagerly in App.tsx so the cascade order is unchanged.
const loadModal = () => import('./Modal')
const ModalImpl = lazyWithRetry(() => loadModal().then((m) => ({ default: m.Modal })))

if (typeof window !== 'undefined') {
  window.setTimeout(() => void loadModal().catch(() => undefined), 2500)
}

export function Modal(props: ComponentProps<typeof ModalImpl>) {
  return (
    <Suspense fallback={null}>
      <ModalImpl {...props} />
    </Suspense>
  )
}
