export interface ChildTerminationObservable {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  once(event: "exit" | "close", listener: () => void): unknown;
  removeListener(event: "exit" | "close", listener: () => void): unknown;
}

export class TerminationUnconfirmedError extends Error {
  constructor(
    message: string,
    readonly confirmation?: Promise<void>,
  ) {
    super(message);
    this.name = "TerminationUnconfirmedError";
  }
}

export function childTerminationConfirmed(
  child: ChildTerminationObservable,
): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

export async function waitForChildTermination(
  child: ChildTerminationObservable,
  timeoutMs: number,
): Promise<boolean> {
  if (childTerminationConfirmed(child)) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onTerminated);
      child.removeListener("close", onTerminated);
      resolve(confirmed);
    };
    const onTerminated = () => finish(true);
    const timer = setTimeout(
      () => finish(childTerminationConfirmed(child)),
      Math.max(1, timeoutMs),
    );
    child.once("exit", onTerminated);
    child.once("close", onTerminated);
    // Cover termination between the initial check and listener registration.
    if (childTerminationConfirmed(child)) finish(true);
  });
}
