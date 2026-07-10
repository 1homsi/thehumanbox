import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../lib/logger'
import { trackEvent } from '../lib/observability'

interface Props {
  children: ReactNode
  onCrash: () => void
}

interface State {
  crashed: boolean
}

export class ThreeDErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    logger.error('3d-boundary', err.message, info.componentStack)
    trackEvent('three_d_crash', { message: err.message })
    this.props.onCrash()
  }

  render() {
    return this.state.crashed ? null : this.props.children
  }
}
