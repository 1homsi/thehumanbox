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

export interface OrphanPidClaim {
  pid: number;
  port?: number;
  token?: string;
}

/**
 * A live simulation may only be terminated when its pid record is tied to the
 * exact stale data lock we recovered. If the pid record disappeared, the
 * child's durable lock claim is sufficient and safer than starting a second
 * writer beside it.
 */
export function resolveOwnedOrphanPid(
  pidRecord: OrphanPidClaim | null,
  recoveredToken: string | null,
  recoveredChildPid: number | null,
): OrphanPidClaim | null {
  if (recoveredToken === null) {
    if (pidRecord === null) return null;
    throw new Error(
      "a live simulation pid has no matching recovered data-lock claim; refusing to terminate it",
    );
  }

  if (pidRecord === null) {
    return recoveredChildPid === null
      ? null
      : { pid: recoveredChildPid, token: recoveredToken };
  }
  if (pidRecord.token !== recoveredToken) {
    throw new Error(
      "the live simulation pid does not match the recovered save-folder lock; refusing to terminate it",
    );
  }
  if (recoveredChildPid !== null && pidRecord.pid !== recoveredChildPid) {
    throw new Error(
      "the live simulation pid changed after claiming the recovered save-folder lock; refusing to terminate it",
    );
  }
  return pidRecord;
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
