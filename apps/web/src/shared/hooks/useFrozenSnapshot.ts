import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Take a one-time snapshot of `producer()` and freeze it until
 * `reload()` is called. Intended for views that should NOT rerender
 * when the underlying data churns (e.g. a family-tree modal opened
 * over a live, ticking world).
 *
 * The producer is held in a ref so `reload` always sees the latest
 * closure without re-rendering when the parent's closure identity
 * changes. The ref is updated inside `useEffect` (post-render) so
 * we don't write a ref during render - that's a real React anti-
 * pattern that the new react-hooks/refs lint catches.
 */
export function useFrozenSnapshot<T>(producer: () => T): { frozen: T; reload: () => void } {
  // Seed the ref with the initial producer; later updates land in
  // the post-render effect below.
  const producerRef = useRef(producer)
  useEffect(() => {
    producerRef.current = producer
  }, [producer])

  const [frozen, setFrozen] = useState<T>(() => producer())
  const reload = useCallback(() => setFrozen(producerRef.current()), [])

  return { frozen, reload }
}
