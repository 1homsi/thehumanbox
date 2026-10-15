import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../../../shared/logger'
import { markWorldGPUFailed } from '../../render/world-view/gpu'

interface Props {
  children: ReactNode
  /** The 2D canvas interior shown once the GPU one has thrown. */
  fallback: ReactNode
}

/** Catches an interior's GPU renderer crash, marks the GPU unusable for later scenes, and draws the 2D canvas instead. */
export class RoomGPUBoundary extends Component<Props, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('2d-world', 'GPU room renderer failed', error, info.componentStack)
    markWorldGPUFailed()
  }

  render() {
    return this.state.crashed ? this.props.fallback : this.props.children
  }
}
