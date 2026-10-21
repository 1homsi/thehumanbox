// BUG-13: the File-menu "Restart simulation" failed silently when the sim was
// hung or slow, because the checkpoint before a stop is required and its
// failure only produced a rejected promise that the menu click swallowed. The
// decision logic lives here so the menu action can offer a no-checkpoint retry
// and a test can pin the messages.
import { tr } from "./i18n";
import { CHECKPOINT_FAILED_ERROR } from "./sim-errors";

/** The button that restarts without waiting for a checkpoint. */
export const NO_CHECKPOINT_BUTTON = "Restart without checkpoint";

export interface RestartFailurePrompt {
  message: string;
  detail: string;
  buttons: string[];
  /** The focused button. Never the lossy retry: Enter must not lose play. */
  defaultId: number;
  cancelId: number;
  /** True when button 0 restarts without waiting for a checkpoint. */
  canRetryWithoutCheckpoint: boolean;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isCheckpointFailure(error: unknown): boolean {
  return errorText(error).includes(CHECKPOINT_FAILED_ERROR);
}

/**
 * The dialog to show when a menu restart fails. A checkpoint failure (a hung or
 * slow sim) offers the no-checkpoint retry; anything else (for example another
 * control-plane operation in progress) just reports the error.
 */
export function restartFailurePrompt(error: unknown): RestartFailurePrompt {
  const detail = errorText(error);
  if (isCheckpointFailure(error)) {
    return {
      message: tr("restartFailed"),
      detail: tr("restartHungDetail", { detail }),
      buttons: [tr("noCheckpoint"), tr("cancel")],
      // Cancel is the default: the retry gives up up to a minute of play.
      defaultId: 1,
      cancelId: 1,
      canRetryWithoutCheckpoint: true,
    };
  }
  return {
    message: tr("restartFailed"),
    detail,
    buttons: [tr("ok")],
    defaultId: 0,
    cancelId: 0,
    canRetryWithoutCheckpoint: false,
  };
}
