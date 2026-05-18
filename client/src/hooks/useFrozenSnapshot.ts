import { useCallback, useRef, useState } from 'react'

export function useFrozenSnapshot<T>(producer: () => T): { frozen: T; reload: () => void } {
  const producerRef = useRef(producer)
  producerRef.current = producer

  const [frozen, setFrozen] = useState<T>(() => producerRef.current())
  const reload = useCallback(() => setFrozen(producerRef.current()), [])

  return { frozen, reload }
}
