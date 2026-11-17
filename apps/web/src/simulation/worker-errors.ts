import { t, type MessageKey } from '../i18n'

export type StartupPhase = 'engine' | 'lock' | 'restore' | 'generate' | 'ready'

export type WorkerErrorCode =
  | 'lock_failed'
  | 'locked_elsewhere'
  | 'autosave_failed'
  | 'restore_failed'
  | 'restore_failed_kept'
  | 'recovery_invalid'
  | 'recovery_missing'
  | 'recovery_unusable'
  | 'reset_failed'
  | 'recovery_restore_failed'
  | 'preserve_failed'
  | 'read_failed'
  | 'engine_failed'
  | 'startup_failed'
  | 'sim_crashed'
  | 'worker_stopped'
  | 'save_failed'

const KEYS: Record<WorkerErrorCode, MessageKey> = {
  lock_failed: 'common.workerError.lockFailed',
  locked_elsewhere: 'common.workerError.lockedElsewhere',
  autosave_failed: 'common.workerError.autosaveFailed',
  restore_failed: 'common.workerError.restoreFailed',
  restore_failed_kept: 'common.workerError.restoreFailedKept',
  recovery_invalid: 'common.workerError.recoveryInvalid',
  recovery_missing: 'common.workerError.recoveryMissing',
  recovery_unusable: 'common.workerError.recoveryUnusable',
  reset_failed: 'common.workerError.resetFailed',
  recovery_restore_failed: 'common.workerError.recoveryRestoreFailed',
  preserve_failed: 'common.workerError.preserveFailed',
  read_failed: 'common.workerError.readFailed',
  engine_failed: 'common.workerError.engineFailed',
  startup_failed: 'common.workerError.startupFailed',
  sim_crashed: 'common.workerError.simCrashed',
  worker_stopped: 'common.workerError.workerStopped',
  save_failed: 'common.workerError.saveFailed',
}

function isWorkerErrorCode(value: unknown): value is WorkerErrorCode {
  return typeof value === 'string' && Object.hasOwn(KEYS, value)
}

export function workerErrorText(code: unknown, detail: unknown, fallback: string): string {
  if (!isWorkerErrorCode(code)) return fallback
  const text = t(KEYS[code])
  return typeof detail === 'string' && detail !== '' ? `${text}: ${detail}` : text
}
