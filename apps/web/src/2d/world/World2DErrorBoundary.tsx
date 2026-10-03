import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../../lib/logger'

interface Props {
  children: ReactNode
  onCrash: () => void
}

interface State {
  crashed: boolean
}

export class World2DErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('2d-world', 'GPU renderer failed', error, info.componentStack)
    this.props.onCrash()
  }

  render() {
    return this.state.crashed ? null : this.props.children
  }
}
