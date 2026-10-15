export function failedSnapshotFrameId(): number {
  return 0
}

export function shouldRetrySnapshot(currentWorldExists: boolean, awaitingFullFrame: boolean): boolean {
  return !currentWorldExists || awaitingFullFrame
}
