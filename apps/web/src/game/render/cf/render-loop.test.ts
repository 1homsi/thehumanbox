import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signalSimFrame } from '../../../simulation/frame-signal'
import { SleepyLoop, wakeRenderLoops } from './render-loop'

/** A requestAnimationFrame the test steps by hand. */
function fakeFrames() {
  let next = 1
  const queue = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    const id = next++
    queue.set(id, fn)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  return {
    pending: () => queue.size,
    step(now = 0) {
      const run = [...queue.values()]
      queue.clear()
      for (const fn of run) fn(now)
    },
  }
}

describe('SleepyLoop', () => {
  let frames: ReturnType<typeof fakeFrames>
  const made: SleepyLoop[] = []
  const loop = (tick: (now: number) => boolean) => {
    const l = new SleepyLoop(tick)
    made.push(l)
    return l
  }
  beforeEach(() => {
    frames = fakeFrames()
  })
  afterEach(() => {
    for (const l of made.splice(0)) l.stop()
    vi.unstubAllGlobals()
  })

  it('asks for a frame only after being woken, and keeps going while the tick says so', () => {
    let calls = 0
    const l = loop(() => ++calls < 3)
    expect(frames.pending()).toBe(0)
    l.wake()
    expect(frames.pending()).toBe(1)
    frames.step()
    frames.step()
    expect(calls).toBe(2)
    expect(l.running).toBe(true)
    frames.step()
    expect(calls).toBe(3)
    // The third tick said "nothing going on": no more frames are requested.
    expect(l.running).toBe(false)
    expect(frames.pending()).toBe(0)
  })

  it('does not stack requests when woken again while running', () => {
    const l = loop(() => true)
    l.wake()
    l.wake()
    wakeRenderLoops()
    expect(frames.pending()).toBe(1)
  })

  it('wakes again for a simulation frame and for a camera move', () => {
    let awake = false
    let calls = 0
    loop(() => {
      calls++
      return awake
    }).wake()
    frames.step()
    expect(frames.pending()).toBe(0)
    awake = true
    signalSimFrame()
    frames.step()
    expect(calls).toBe(2)
    expect(frames.pending()).toBe(1)
    awake = false
    frames.step()
    expect(frames.pending()).toBe(0)
    wakeRenderLoops()
    expect(frames.pending()).toBe(1)
  })

  it('stays stopped once stopped, and a stopped loop ignores wakes', () => {
    const l = loop(() => true)
    l.wake()
    l.stop()
    expect(frames.pending()).toBe(0)
    wakeRenderLoops()
    l.wake()
    expect(frames.pending()).toBe(0)
  })
})
