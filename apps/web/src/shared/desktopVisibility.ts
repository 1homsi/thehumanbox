export type DesktopVisibility = 'minimized' | 'hidden' | 'restored'
export const DESKTOP_PAUSE_WHEN_HIDDEN_EVENT = 'thb:desktop-pause-when-hidden'

export function isDesktopWindowInactive(visibility: unknown): boolean {
  return visibility === 'minimized' || visibility === 'hidden'
}

export function shouldPauseDesktopRenderer(pauseWhenHidden: boolean, visibility: unknown): boolean {
  return pauseWhenHidden && isDesktopWindowInactive(visibility)
}

export function parsePauseWhenHiddenPreference(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export interface RendererLoopControls {
  pause(): void
  resume(): void
}

export function syncRendererLoopPause(controls: RendererLoopControls, paused: boolean): void {
  if (paused) controls.pause()
  else controls.resume()
}

export function threeFrameLoopForPause(paused: boolean): 'never' | 'always' {
  return paused ? 'never' : 'always'
}
