export class FrameSequence {
  private _lastFrameId = 0
  private _awaitingFullFrame = false

  get lastFrameId(): number {
    return this._lastFrameId
  }

  get awaitingFullFrame(): boolean {
    return this._awaitingFullFrame
  }

  beginSnapshotRequest(): void {
    this._lastFrameId = 0
  }

  failSnapshotRequest(): void {
    this._lastFrameId = 0
    this._awaitingFullFrame = true
  }

  markAwaitingFullFrame(): void {
    this._awaitingFullFrame = true
  }

  isStale(frameId: number): boolean {
    return this._lastFrameId > 0 && frameId <= this._lastFrameId
  }

  shouldRetrySnapshot(currentWorldExists: boolean): boolean {
    return !currentWorldExists || this._awaitingFullFrame
  }

  acceptFrame(frameId: number, full: boolean): void {
    this._lastFrameId = frameId
    if (full) this._awaitingFullFrame = false
  }
}
