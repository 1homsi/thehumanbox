import { RESTART_SIMULATION_OPERATION } from "./exclusive-operation";

// Deferred error prompts (see error-dialog.ts) re-check their state once the
// screen is free. These predicates take that state as arguments rather than
// reading the sim process, so they stay free of Electron and are unit-tested.

/**
 * Whether a deferred restart-failure prompt still describes the screen: the
 * sim it offered to replace is still the one running, and the app is not
 * quitting. A restart that already replaced the hung sim makes it moot.
 */
export function restartFailureStillRelevant(state: {
  quitting: boolean;
  activeSim: unknown;
  failedSim: unknown;
}): boolean {
  return !state.quitting && state.activeSim === state.failedSim;
}

/**
 * Whether a deferred unexpected-exit prompt still describes the screen: no sim
 * is up, no restart is in flight to bring one back, and the app is not
 * quitting. Any other operation keeps the prompt, so a crash is never dropped.
 */
export function simExitStillRelevant(state: {
  quitting: boolean;
  activeSim: unknown;
  operation: string | null;
}): boolean {
  return (
    !state.quitting &&
    state.activeSim === null &&
    state.operation !== RESTART_SIMULATION_OPERATION
  );
}
