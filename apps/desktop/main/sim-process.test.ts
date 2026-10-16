import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

class FakeChild extends EventEmitter {
  pid = 4242;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  signals: string[] = [];

  kill(signal?: string): boolean {
    this.signals.push(signal ?? "default");
    if (this.exitCode === null && this.signalCode === null) {
      setTimeout(() => {
        this.signalCode = (signal ?? "SIGTERM") as NodeJS.Signals;
        this.emit("exit", null, this.signalCode);
        this.emit("close", null, this.signalCode);
      }, 1);
    }
    return true;
  }
}

// Loads the compiled sim-process module with its Electron, child_process and
// startup dependencies replaced. The child never binds its port, so the start
// stays in flight until something stops it.
function loadSimProcess(child: FakeChild, onSpawn: () => void) {
  const fakeProcess = {
    pid: process.pid,
    platform: process.platform,
    on() {
      return fakeProcess;
    },
    stdout: { on() {}, write() {} },
    stderr: { on() {}, write() {} },
  };
  const lock = {
    token: "lock-token",
    root: "/tmp/thb-test-data",
    recoveredToken: null,
    recoveredChildPid: null,
    released: 0,
    release() {
      this.released += 1;
    },
  };
  const context = vm.createContext({
    exports: {},
    __dirname,
    process: fakeProcess,
    console: { log() {}, warn() {}, error() {} },
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    require: (id: string) => {
      switch (id) {
        case "electron":
          return {
            app: {
              isPackaged: true,
              getPath: () => "/tmp/thb-test-logs",
            },
          };
        case "node:child_process":
          return {
            spawn: () => {
              onSpawn();
              return child;
            },
            execFileSync() {
              throw new Error("no process table in tests");
            },
          };
        case "node:net":
          return {
            createServer: () => {
              let port = 0;
              return {
                unref() {},
                on() {},
                listen(_port: number, _host: string, cb: () => void) {
                  port = 4321;
                  cb();
                },
                address: () => ({ port }),
                close(cb: () => void) {
                  cb();
                },
              };
            },
          };
        case "node:fs":
          return { ...fs, existsSync: () => true };
        case "node:path":
          return path;
        case "node:crypto":
          return require("node:crypto");
        case "./sim-log":
          return {
            openRotatingLog: () => ({ write() {}, close() {} }),
          };
        case "./settings":
          return {
            effectiveDataRoot: () => "/tmp/thb-test-data",
            prepareDataRoot: () => "/tmp/thb-test-data",
          };
        case "./sim-ready":
          return {
            SIM_START_TIMEOUT_MS: 60_000,
            waitForSimulation: ({ isAlive }: { isAlive: () => boolean }) =>
              new Promise<void>((_resolve, reject) => {
                const timer = setInterval(() => {
                  if (isAlive()) return;
                  clearInterval(timer);
                  reject(new Error("simulation-rs exited before binding the port"));
                }, 5);
                // A failing test must not leave this poll keeping the process alive.
                timer.unref();
              }),
          };
        case "./sim-env":
          return { buildLocalSimEnv: () => ({}) };
        case "./data-lock":
          return {
            acquireDataRootLock: () => lock,
            removePidRecordIfOwned() {},
            writePidRecordAtomically() {},
          };
        case "./world-safety":
          return {
            finishCommittedMigrationForActiveRoot() {},
            pathsReferToSameLocation: (a: string, b: string) => a === b,
            recoverInterruptedFileReplacement() {},
          };
        case "./sim-errors":
        case "./process-lifecycle":
          return require(path.join(__dirname, id));
        default:
          throw new Error(`unexpected require in sim-process test: ${id}`);
      }
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "sim-process.js"), "utf8"),
    context,
  );
  return {
    ...(context.exports as typeof import("./sim-process")),
    lock,
  };
}

test("the dev binary path points at the workspace target directory", () => {
  const sim = loadSimProcess(new FakeChild(), () => {});
  const name = process.platform === "win32" ? "simulation-rs.exe" : "simulation-rs";

  // Anchor the expectation to a real marker rather than the same
  // parent-directory count the source uses: the workspace root is the nearest
  // ancestor whose Cargo.toml declares the workspace.
  const isWorkspaceRoot = (dir: string): boolean => {
    const manifest = path.join(dir, "Cargo.toml");
    return (
      fs.existsSync(manifest) &&
      fs.readFileSync(manifest, "utf8").includes("[workspace]")
    );
  };
  let workspaceRoot = __dirname;
  while (!isWorkspaceRoot(workspaceRoot) && path.dirname(workspaceRoot) !== workspaceRoot) {
    workspaceRoot = path.dirname(workspaceRoot);
  }
  assert.ok(isWorkspaceRoot(workspaceRoot));

  const resolved = sim.devBinaryPath();
  assert.equal(resolved, path.join(workspaceRoot, "target", "release", name));
  // The pre-fix path pointed at `apps/simulation/target/release`, which does
  // not exist in this repository.
  assert.equal(resolved.includes(`${path.sep}simulation${path.sep}`), false);
});

test("quit stops a simulation that is still loading instead of leaving it running", { timeout: 5000 }, async () => {
  const child = new FakeChild();
  let spawned!: () => void;
  const spawnedPromise = new Promise<void>((resolve) => {
    spawned = resolve;
  });
  const sim = loadSimProcess(child, spawned);

  const starting = sim.startSim({} as never);
  const rejected = assert.rejects(starting, /exited before binding the port/);
  await spawnedPromise;

  // The quit gate must see a start that has not bound yet, or before-quit
  // lets the app exit and orphans the child.
  assert.equal(sim.simLifecyclePending(), true);
  assert.equal(sim.activeSim(), null);

  await sim.stopSim();
  await rejected;

  // The first signal must be the quit's SIGTERM; the start's own SIGKILL
  // cleanup after the child is already gone is harmless.
  assert.equal(child.signals[0], "SIGTERM");
  assert.equal(child.signalCode, "SIGTERM");
  assert.equal(sim.activeSim(), null);
  assert.equal(sim.simLifecyclePending(), false);
  assert.equal(sim.lock.released, 1);
});
