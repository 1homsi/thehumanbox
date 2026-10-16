// A sim crash and a sim restart can both want to raise a modal error box at the
// same moment: the File-menu restart-failure prompt (BUG-13) stays open while
// the hung child finally dies, which fires the unexpected-exit prompt (BUG-30).
// Two stacked modal boxes leave the second one wedged behind the first, so only
// one dialog may be up at a time. The first to claim the slot owns the screen.
// A dialog that cannot claim it is deferred and offered once the slot frees, so
// an actionable prompt (restart without a checkpoint) is not silently lost.

interface OpenErrorDialog {
  name: string;
}

/**
 * A dialog that lost the race for the slot. `show` runs once the slot frees;
 * `isStillRelevant` decides whether the state it describes still holds at that
 * point, so a sim that has since restarted is not nagged about.
 */
export interface DeferredErrorDialog {
  show: () => void;
  isStillRelevant: () => boolean;
}

let openErrorDialog: OpenErrorDialog | null = null;
let deferredErrorDialog: DeferredErrorDialog | null = null;

/**
 * Claim the single error-dialog slot. Returns a release function, or null when
 * another error dialog is already open (in which case the caller must defer or
 * drop its own). The release is tied to this claim, so a late release from an
 * earlier dialog cannot clear a newer one.
 */
export function claimErrorDialog(name: string): (() => void) | null {
  if (openErrorDialog !== null) return null;
  const claim: OpenErrorDialog = { name };
  openErrorDialog = claim;
  return () => {
    if (openErrorDialog === claim) openErrorDialog = null;
  };
}

/** The error dialog currently on screen, or null when none is. */
export function currentErrorDialog(): string | null {
  return openErrorDialog?.name ?? null;
}

/**
 * Remember a dialog that lost the slot. Only the most recent one is kept: it
 * supersedes an older deferred dialog, which describes an earlier state.
 */
export function deferErrorDialog(dialog: DeferredErrorDialog): void {
  deferredErrorDialog = dialog;
}

/**
 * Run `body` while holding the single error-dialog slot. Returns false without
 * running it when another dialog already holds the slot; the caller then
 * decides whether to defer or drop its own prompt. The slot is always released
 * and the deferred dialog drained afterwards, so a call site cannot forget it.
 */
export async function withErrorDialog(
  name: string,
  body: () => Promise<void> | void,
): Promise<boolean> {
  const release = claimErrorDialog(name);
  if (!release) return false;
  try {
    await body();
  } finally {
    release();
    try {
      drainDeferredErrorDialog();
    } catch (drainError) {
      // Never let a deferred dialog mask the body's own error.
      console.error("[main] deferred error dialog failed to drain:", drainError);
    }
  }
  return true;
}

/**
 * Offer the deferred dialog, if any. Runs after the slot is released, so a
 * deferred prompt is raised the moment the screen is free. `show` may claim
 * the slot again, and the deferred dialog is dropped when its state is no
 * longer relevant (or the app is quitting).
 */
export function drainDeferredErrorDialog(): void {
  const dialog = deferredErrorDialog;
  if (!dialog || openErrorDialog !== null) return;
  deferredErrorDialog = null;
  if (!dialog.isStillRelevant()) return;
  dialog.show();
}
