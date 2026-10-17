import { useSyncExternalStore } from 'react'

function subscribe(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

function getSnapshot(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/** Reactively tracks tab visibility so render loops can stop scheduling frames while backgrounded. */
export function useDocumentHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
