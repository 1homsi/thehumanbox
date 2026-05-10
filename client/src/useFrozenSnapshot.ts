import { useCallback, useRef, useState } from 'react'

/**
 * Freeze a value at the moment a component mounts (or whenever `reload` is
 * called) so heavy modals don't re-render on every WS tick.
 *
 * The producer arg captures whatever the parent considers "current" - the
 * live world, an organism list, etc. The first call freezes that value
 * into state. Subsequent parent renders pass a fresh producer, but state
 * stays put until `reload()` is invoked.
 *
 * @example
 *   const { frozen, reload } = useFrozenSnapshot(() => world)
 *   // ... render from `frozen`, never the live world
 *   <button onClick={reload}>⟳</button>
 */
export function useFrozenSnapshot<T>(producer: () => T): { frozen: T; reload: () => void } {
  const producerRef = useRef(producer)
  producerRef.current = producer

  const [frozen, setFrozen] = useState<T>(() => producerRef.current())
  const reload = useCallback(() => setFrozen(producerRef.current()), [])

  return { frozen, reload }
}
