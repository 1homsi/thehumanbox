import { onSimFrame } from '../../../simulation/frame-signal'

/**
 * A requestAnimationFrame loop that goes to sleep. `tick` returns whether anything is still
 * going on; once it says no, the loop stops asking for frames, so a paused world with a still
 * camera costs the page nothing (an idle rAF loop alone kept the main thread waking 60 times a
 * second). `wake()` starts it again; every loop is woken by a new simulation frame, a camera
 * move and a visibility change (`wakeRenderLoops`), and by its owner when the UI it reads changes.
 */
export class SleepyLoop {
  private raf = 0
  private stopped = false
  private readonly tick: (now: number) => boolean

  constructor(tick: (now: number) => boolean) {
    this.tick = tick
    loops.add(this)
  }

  get running(): boolean {
    return this.raf !== 0
  }

  /** Run until `tick` returns false. A no-op while already running or after `stop`. */
  wake(): void {
    if (this.raf !== 0 || this.stopped) return
    this.raf = requestAnimationFrame(this.run)
  }

  stop(): void {
    this.stopped = true
    loops.delete(this)
    if (this.raf !== 0) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private run = (now: number): void => {
    this.raf = 0
    if (this.stopped) return
    if (this.tick(now) && !this.stopped) this.raf = requestAnimationFrame(this.run)
  }
}

const loops = new Set<SleepyLoop>()

/** Wake every loop that has gone to sleep: something it watches may have changed. */
export function wakeRenderLoops(): void {
  for (const loop of loops) loop.wake()
}

// A frame of the simulation is the one change nobody else announces.
onSimFrame(wakeRenderLoops)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wakeRenderLoops()
  })
}
