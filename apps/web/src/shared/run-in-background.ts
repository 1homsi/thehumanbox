import { loadBool, saveBool } from '../state/persistence'

const STORAGE_KEY = 'thb-run-in-background'
export const RUN_IN_BACKGROUND_EVENT = 'thb:run-in-background'

/** Whether the browser world keeps simulating while its tab is hidden. Off by default to save battery. */
export function readRunInBackground(): boolean {
  return loadBool(STORAGE_KEY)
}

/** Save the choice and tell the running simulation, which applies it without a reload. */
export function setRunInBackground(value: boolean) {
  saveBool(STORAGE_KEY, value)
  window.dispatchEvent(new CustomEvent(RUN_IN_BACKGROUND_EVENT, { detail: value }))
}
