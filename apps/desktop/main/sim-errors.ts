// Kept electron-free so both the sim process (which throws it) and the menu
// recovery helper (which classifies it) — and their tests — share one literal.
export const CHECKPOINT_FAILED_ERROR =
  "could not checkpoint the active world; it remains open so the operation can be retried";
