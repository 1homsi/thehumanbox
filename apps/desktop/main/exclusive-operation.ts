let activeOperation: { token: symbol; name: string } | null = null;

/**
 * Reject overlapping desktop control-plane operations before either caller
 * can stop the simulator, rewrite settings, or enter a rollback path. IPC
 * handlers are asynchronous, so Electron otherwise allows a double click (or
 * a menu action during migration) to interleave two independent transactions.
 */
export async function runExclusiveDesktopOperation<T>(
  name: string,
  operation: () => Promise<T> | T,
): Promise<T> {
  if (activeOperation) {
    throw new Error(
      `cannot ${name} while ${activeOperation.name} is still in progress`,
    );
  }
  const token = Symbol(name);
  activeOperation = { token, name };
  try {
    return await operation();
  } finally {
    if (activeOperation?.token === token) activeOperation = null;
  }
}

export function currentDesktopOperation(): string | null {
  return activeOperation?.name ?? null;
}
