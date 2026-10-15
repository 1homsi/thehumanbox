import * as net from "node:net";

/** The server's `/version` reports its crate name; a foreign listener will not. */
export const SIM_SERVICE_NAME = "simulation-rs";

// The server binds only after it has loaded and encoded the whole world, so a
// big save on a slow disk legitimately takes a long time. A dead child is
// detected immediately through `isAlive`, so this only bounds a live but
// stuck one.
export const SIM_START_TIMEOUT_MS = 120_000;

export function tcpAccepts(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function isSimulationService(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/version`, {
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { name?: unknown };
    return body.name === SIM_SERVICE_NAME;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface WaitForSimulationOptions {
  port: number;
  timeoutMs: number;
  isAlive: () => boolean;
  /** Overridable for tests. */
  accepts?: (port: number) => Promise<boolean>;
  isService?: (port: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Wait until our child is serving. `pickFreePort` closes its probe socket
 * before the spawn, so another process can take the port in between: a bare
 * TCP accept would then pass while our sim is still loading (or about to die
 * on EADDRINUSE). Require the listener to identify itself as the simulation.
 */
export async function waitForSimulation(
  options: WaitForSimulationOptions,
): Promise<void> {
  const {
    port,
    timeoutMs,
    isAlive,
    accepts = tcpAccepts,
    isService = isSimulationService,
    sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    now = Date.now,
  } = options;
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (!isAlive())
      throw new Error("simulation-rs exited before binding the port");
    if ((await accepts(port)) && (await isService(port))) {
      // A foreign listener could have answered while our child died.
      if (!isAlive())
        throw new Error("simulation-rs exited before binding the port");
      return;
    }
    await sleep(100);
  }
  throw new Error(
    `simulation-rs did not start listening on 127.0.0.1:${port} within ${timeoutMs}ms`,
  );
}
