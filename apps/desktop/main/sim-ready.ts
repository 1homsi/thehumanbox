import * as net from "node:net";

/** The server's `/version` reports its crate name; a foreign listener will not. */
export const SIM_SERVICE_NAME = "simulation-rs";

/**
 * The websocket protocol this app speaks. The server reports its own on `/version` and in the hello it sends first on
 * every socket; it must match `WIRE_PROTOCOL` in `apps/server/src/routes.rs` and `wire-protocol.ts` in the web app.
 */
export const SIM_WIRE_PROTOCOL = 1;

// The server binds only after it has loaded and encoded the whole world, so a
// big save on a slow disk legitimately takes a long time. A dead child is
// detected immediately through `isAlive`, so this only bounds a live but
// stuck one.
export const SIM_START_TIMEOUT_MS = 60_000;

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

/**
 * What answers on a port: `other` when nothing identifies as the simulation; otherwise the simulation's protocol
 * (null for a build from before the protocol was reported) and version.
 */
export type SimulationProbe =
  | { kind: "other" }
  | { kind: "simulation"; protocol: number | null; version: string | null };

export async function probeSimulation(port: number): Promise<SimulationProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/version`, {
      signal: controller.signal,
    });
    if (!response.ok) return { kind: "other" };
    const body = (await response.json()) as {
      name?: unknown;
      version?: unknown;
      protocol?: unknown;
    };
    if (body.name !== SIM_SERVICE_NAME) return { kind: "other" };
    return {
      kind: "simulation",
      protocol: typeof body.protocol === "number" ? body.protocol : null,
      version: typeof body.version === "string" ? body.version : null,
    };
  } catch {
    return { kind: "other" };
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
  probe?: (port: number) => Promise<SimulationProbe>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** The message for a simulation on the port that speaks another protocol than this app. */
export function versionMismatchMessage(
  port: number,
  found: { protocol: number | null; version: string | null },
): string {
  const build = found.version ? `version ${found.version}` : "an older build";
  const protocol = found.protocol === null ? "no protocol" : `protocol ${found.protocol}`;
  return (
    `The simulation already listening on 127.0.0.1:${port} is ${build} (${protocol}), ` +
    `but this app needs protocol ${SIM_WIRE_PROTOCOL}. ` +
    "Quit any other copy of The Human Box, then open it again."
  );
}

/**
 * Wait until our child is serving. `pickFreePort` closes its probe socket
 * before the spawn, so another process can take the port in between: a bare
 * TCP accept would then pass while our sim is still loading (or about to die
 * on EADDRINUSE). Require the listener to identify itself as the simulation.
 *
 * A simulation that answers but speaks another protocol is a stale copy of
 * the app holding the port, so waiting would only end at the timeout: fail at once with what to do.
 */
export async function waitForSimulation(
  options: WaitForSimulationOptions,
): Promise<void> {
  const {
    port,
    timeoutMs,
    isAlive,
    accepts = tcpAccepts,
    probe = probeSimulation,
    sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    now = Date.now,
  } = options;
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    if (!isAlive())
      throw new Error("simulation-rs exited before binding the port");
    if (await accepts(port)) {
      const found = await probe(port);
      if (found.kind === "simulation") {
        if (found.protocol !== SIM_WIRE_PROTOCOL)
          throw new Error(versionMismatchMessage(port, found));
        // A foreign listener could have answered while our child died.
        if (!isAlive())
          throw new Error("simulation-rs exited before binding the port");
        return;
      }
    }
    await sleep(100);
  }
  throw new Error(
    `simulation-rs did not start serving on 127.0.0.1:${port} within ${timeoutMs}ms`,
  );
}
