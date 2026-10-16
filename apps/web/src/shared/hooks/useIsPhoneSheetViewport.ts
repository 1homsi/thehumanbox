import { useEffect, useState } from 'react'
import { PHONE_SHEET_QUERY } from '../phone'

/** Tracks the exact width breakpoint used by the modal bottom-sheet styles. */
export function useIsPhoneSheetViewport(): boolean {
  const [isSheetViewport, setIsSheetViewport] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(PHONE_SHEET_QUERY).matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(PHONE_SHEET_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsSheetViewport(e.matches)
    setIsSheetViewport(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isSheetViewport
}
