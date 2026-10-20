import { Component, createRef, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../../../shared/logger'
import { wakeRenderLoopsAfterContextRestore } from '../../render/cf/render-loop'
import { canUseWorldGPU, markWorldGPUFailed, onWorldGPUFailed } from '../../render/world-view/gpu'
import { watchForWebGLContextRecovery } from '../../render/world-view/webglContextRecovery'

interface Props {
  children: ReactNode
  /** The 2D canvas interior shown once the GPU one has thrown. */
  fallback: ReactNode
}

/**
 * Catches an interior's GPU renderer crash or a WebGL context loss that never
 * restores, marks the GPU unusable for later scenes, and draws the 2D canvas
 * instead. It also reacts when the GPU is marked failed elsewhere while this
 * interior is already mounted — an interior opened on a working context kept
 * drawing into a dead one otherwise.
 */
export class RoomGPUBoundary extends Component<Props, { crashed: boolean }> {
  state = { crashed: false }
  private host = createRef<HTMLDivElement>()
  private recovery: ReturnType<typeof watchForWebGLContextRecovery> | null = null
  private unsubscribe: (() => void) | null = null

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidMount() {
    // Subscribe before the probe: `markWorldGPUFailed` only notifies on the
    // transition, so a failure that landed between the caller's render and this
    // commit would otherwise never reach us.
    this.unsubscribe = onWorldGPUFailed(this.markFailed)
    if (!canUseWorldGPU()) {
      this.markFailed()
      return
    }
    const host = this.host.current
    if (host) {
      this.recovery = watchForWebGLContextRecovery(
        document,
        host,
        false,
        markWorldGPUFailed,
        wakeRenderLoopsAfterContextRestore,
      )
    }
  }

  componentWillUnmount() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.disposeRecovery()
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('2d-world', 'GPU room renderer failed', error, info.componentStack)
    this.disposeRecovery()
    markWorldGPUFailed()
  }

  private disposeRecovery() {
    this.recovery?.dispose()
    this.recovery = null
  }

  private markFailed = () => {
    if (this.state.crashed) return
    this.disposeRecovery()
    this.setState({ crashed: true })
  }

  render() {
    if (this.state.crashed) return this.props.fallback
    return (
      // `display: contents` keeps the wrapper out of the layout; it only gives
      // the context-loss listener an ancestor of the canvas to watch.
      <div ref={this.host} style={{ display: 'contents' }}>
        {this.props.children}
      </div>
    )
  }
}
