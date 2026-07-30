import { BrowserWindow, dialog, IpcMain } from "electron";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  defaultDataRoot,
  effectiveDataRoot,
  loadSettings,
  prepareDataRoot,
  saveSettings,
  Settings,
  worldsRoot,
} from "./settings";
import {
  activeSim,
  checkpointActiveSim,
  quiesceRecoveredDataRoot,
  startSim,
  startSimWithDataRootLock,
  stopSim,
} from "./sim-process";
import { remoteApiHost } from "./sim-mode";
import { acquireDataRootLock, type DataRootLock } from "./data-lock";
import { runExclusiveDesktopOperation } from "./exclusive-operation";
import {
  atomicWriteNewFile,
  assertEmptyOrIdentifiedDataRoot,
  assertExportOutsideDataRoot,
  assertSameLoadedWorld,
  assertNoLegacyWorldAtMigrationTarget,
  assertNoUnmigratedLegacyWorld,
  beginSaveFolderMigration,
  chooseAvailableWorldHash,
  copyWorldsToStaging,
  downloadAndValidateWorldSave,
  finishSaveFolderMigration,
  hasRecoverableSaveFolderMigration,
  inspectSaveFolderMigrationSource,
  initializeDataRootIdentity,
  markSaveFolderMigrationVerified,
  recoverInterruptedSaveFolderMigration,
  requireExistingDataRootIdentity,
  resolveActiveWorldFiles,
  rootsOverlap,
  restoreParkedLiveWorld,
  syncDirectoryBestEffort,
  validateWorldHash,
  validateWorldSaveBytes,
  verifySaveFolderMigrationCopy,
} from "./world-safety";

interface ReplacedFile {
  target: string;
  backup: string | null;
}

function exclusiveIpcHandler<TArgs extends unknown[], TResult>(
  name: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult,
): (...args: TArgs) => Promise<TResult> {
  return (...args) =>
    runExclusiveDesktopOperation(name, () => handler(...args));
}

function replaceFileForTransaction(
  target: string,
  data: string | Uint8Array,
  token: string,
): ReplacedFile {
  const prepared = `${target}.next-${token}`;
  const backup = fs.existsSync(target) ? `${target}.rollback-${token}` : null;
  atomicWriteNewFile(prepared, data);
  try {
    if (backup) fs.renameSync(target, backup);
    fs.renameSync(prepared, target);
    syncDirectoryBestEffort(path.dirname(target));
    return { target, backup };
  } catch (error) {
    try {
      fs.unlinkSync(prepared);
    } catch {
      /* noop */
    }
    if (backup && !fs.existsSync(target) && fs.existsSync(backup))
      fs.renameSync(backup, target);
    throw error;
  }
}

function rollbackReplacedFile(replaced: ReplacedFile): void {
  try {
    fs.unlinkSync(replaced.target);
  } catch {
    /* noop */
  }
  if (replaced.backup && fs.existsSync(replaced.backup)) {
    fs.renameSync(replaced.backup, replaced.target);
  }
  syncDirectoryBestEffort(path.dirname(replaced.target));
}

function finishReplacedFile(replaced: ReplacedFile): void {
  if (replaced.backup) {
    try {
      fs.unlinkSync(replaced.backup);
    } catch {
      /* noop */
    }
  }
  syncDirectoryBestEffort(path.dirname(replaced.target));
}

function activeWorld(settings: Settings): {
  hash: string;
  savePath: string;
  markerPath: string;
} {
  return resolveActiveWorldFiles(effectiveDataRoot(settings));
}

async function loadLocalRenderer(
  getWindow: () => BrowserWindow | null,
  port: number,
  extra?: Record<string, string>,
) {
  const win = getWindow();
  if (!win) return;
  const indexFile = path.join(__dirname, "..", "renderer", "index.html");
  await win.loadFile(indexFile, {
    query: { desktop: "1", api: `127.0.0.1:${port}`, ...extra },
  });
}

async function restartPriorWorld(settings: Settings): Promise<string | null> {
  if (settings.mode !== "local") return null;
  try {
    await startSim(settings);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function checkpointRunningWorld(
  port: number,
  context: string,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/save`, {
      method: "POST",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        `${context} verification checkpoint failed (${response.status})`,
      );
  } finally {
    clearTimeout(timer);
  }
}

async function verifyImportedWorldLoaded(
  port: number,
  markerPath: string,
  importedHash: string,
  savePath: string,
  expected: ReturnType<typeof validateWorldSaveBytes>,
): Promise<void> {
  await checkpointRunningWorld(port, "world");
  const activeHash = fs.readFileSync(markerPath, "utf8").trim();
  if (activeHash !== importedHash) {
    throw new Error(
      `simulation activated world ${activeHash}, expected imported world ${importedHash}`,
    );
  }
  const loaded = validateWorldSaveBytes(fs.readFileSync(savePath));
  assertSameLoadedWorld(expected, loaded);
}

async function verifyFreshWorldLoaded(
  port: number,
  settings: Settings,
  previousHash?: string,
): Promise<void> {
  await checkpointRunningWorld(port, "new world");
  const world = activeWorld(settings);
  if (previousHash !== undefined && world.hash === previousHash) {
    throw new Error(
      `new-world reset reselected the previous world ${previousHash}`,
    );
  }
  const loaded = validateWorldSaveBytes(fs.readFileSync(world.savePath));
  if (loaded.seedText === "0") {
    throw new Error(
      "new local world has no stable seed and cannot be committed",
    );
  }
}

export function registerIpc(
  ipc: IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  ipc.handle("settings:get", () => loadSettings());

  ipc.handle(
    "settings:set",
    exclusiveIpcHandler(
      "update desktop settings",
      async (_e, next: Settings) => {
        const current = loadSettings();
        if (
          path.resolve(effectiveDataRoot(current)) !==
          path.resolve(effectiveDataRoot(next))
        ) {
          throw new Error(
            "use the save-folder migration control to change where worlds are stored",
          );
        }
        saveSettings(next);
        return next;
      },
    ),
  );

  ipc.handle("sim:status", () => {
    const sim = activeSim();
    return sim
      ? { running: true, port: sim.port }
      : { running: false, port: null };
  });

  ipc.handle(
    "sim:restart",
    exclusiveIpcHandler("restart the simulation", async () => {
      await stopSim(5_000, true);
      const s = loadSettings();
      const indexFile = path.join(__dirname, "..", "renderer", "index.html");
      if (s.mode === "local") {
        try {
          const sim = await startSim(s);
          await loadLocalRenderer(getWindow, sim.port);
          return { running: true, port: sim.port };
        } catch (e) {
          return { running: false, port: null, error: (e as Error).message };
        }
      }
      const win = getWindow();
      if (win) {
        const apiBase = remoteApiHost(s.remoteUrl);
        await win.loadFile(indexFile, {
          query: { desktop: "1", api: apiBase },
        });
      }
      return {
        running: false,
        port: null,
        mode: "remote",
        remoteUrl: s.remoteUrl,
      };
    }),
  );

  ipc.handle("app:reload", async () => {
    const win = getWindow();
    win?.reload();
  });

  ipc.handle(
    "world:importFromRemote",
    exclusiveIpcHandler(
      "import a world",
      async (_e, payload: { hash: string; remoteUrl: string }) => {
        const { hash, remoteUrl } = payload;
        validateWorldHash(hash);
        const url = `${remoteUrl.replace(/\/+$/, "")}/worlds/${hash}/save`;

        // Download, bound, decode and validate the complete save before touching
        // the active process or its live-world marker.
        const validated = await downloadAndValidateWorldSave(url);
        if (validated.seedText === "0") {
          throw new Error(
            "remote save has no stable world seed and cannot be imported safely",
          );
        }
        const priorSettings = loadSettings();
        prepareDataRoot(priorSettings);
        const worldsDir = worldsRoot(priorSettings);
        const token = randomUUID();
        const stagingDir = path.join(worldsDir, `.import-${token}`);
        const stagingSave = path.join(stagingDir, "world.save");

        const markerPath = path.join(worldsDir, "_live");
        let marker: ReplacedFile | null = null;
        let committed = false;
        let importedHash = hash;
        let stoppedForOperation = false;
        let operationLock: DataRootLock | null = null;
        try {
          await stopSim(5_000, true);
          stoppedForOperation = true;
          operationLock = acquireDataRootLock(effectiveDataRoot(priorSettings));
          fs.mkdirSync(worldsDir, { recursive: true });
          importedHash = chooseAvailableWorldHash(worldsDir, hash);
          atomicWriteNewFile(stagingSave, validated.bytes);
          const targetDir = path.join(worldsDir, importedHash);
          fs.renameSync(stagingDir, targetDir);
          syncDirectoryBestEffort(worldsDir);
          committed = true;
          marker = replaceFileForTransaction(markerPath, importedHash, token);

          const localSettings = { ...priorSettings, mode: "local" as const };
          saveSettings(localSettings);
          const handedLock = operationLock;
          operationLock = null;
          const sim = await startSimWithDataRootLock(localSettings, handedLock);
          await verifyImportedWorldLoaded(
            sim.port,
            markerPath,
            importedHash,
            path.join(worldsDir, importedHash, "world.save"),
            validated,
          );
          await loadLocalRenderer(getWindow, sim.port, {
            imported: importedHash,
          });
          finishReplacedFile(marker);
          return {
            running: true,
            port: sim.port,
            importedHash,
            tick: validated.tick,
            schemaVersion: validated.version,
          };
        } catch (error) {
          if (stoppedForOperation) await stopSim().catch(() => {});
          let rollbackError: string | null = null;
          if (marker) {
            try {
              operationLock ??= acquireDataRootLock(
                effectiveDataRoot(priorSettings),
              );
              rollbackReplacedFile(marker);
            } catch (rollbackFailure) {
              rollbackError =
                rollbackFailure instanceof Error
                  ? rollbackFailure.message
                  : String(rollbackFailure);
            }
          }
          if (stoppedForOperation) saveSettings(priorSettings);
          operationLock?.release();
          operationLock = null;
          const restartError = rollbackError
            ? "not attempted because the previous live-world marker could not be restored"
            : stoppedForOperation
              ? await restartPriorWorld(priorSettings)
              : null;
          const preserved = committed
            ? ` The validated import remains preserved as worlds/${importedHash}.`
            : "";
          const restoreDetail = restartError
            ? ` The previous world also failed to restart: ${restartError}.`
            : "";
          const rollbackDetail = rollbackError
            ? ` The live-world marker could not be rolled back because the folder is locked: ${rollbackError}.`
            : "";
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}.${preserved}${restoreDetail}${rollbackDetail}`,
          );
        } finally {
          operationLock?.release();
          if (!committed)
            fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      },
    ),
  );

  ipc.handle(
    "world:migrateDataRoot",
    exclusiveIpcHandler(
      "move the save folder",
      async (_e, payload: { targetDir: string | null }) => {
        const priorSettings = loadSettings();
        const sourceRoot = prepareDataRoot(priorSettings);
        const requestedTarget =
          payload.targetDir === null ? defaultDataRoot() : payload.targetDir;
        if (!path.isAbsolute(requestedTarget))
          throw new Error("save folder must be an absolute path");
        const targetRoot = path.resolve(requestedTarget);
        if (path.resolve(sourceRoot) === targetRoot)
          return { settings: priorSettings, migrated: false };
        if (rootsOverlap(sourceRoot, targetRoot)) {
          throw new Error(
            "the new save folder cannot overlap the current save folder",
          );
        }
        assertNoUnmigratedLegacyWorld(sourceRoot);
        assertNoLegacyWorldAtMigrationTarget(targetRoot);
        if (targetRoot !== path.resolve(defaultDataRoot())) {
          let targetStat: fs.Stats;
          try {
            targetStat = fs.statSync(targetRoot);
          } catch {
            throw new Error(
              `selected save folder is unavailable: ${targetRoot}. Reconnect or recreate it, then choose it again.`,
            );
          }
          if (!targetStat.isDirectory())
            throw new Error("selected save folder is not a directory");
        }
        const nextSettings: Settings = {
          ...priorSettings,
          saveLocationOverride:
            targetRoot === path.resolve(defaultDataRoot()) ? null : targetRoot,
        };
        const recoverableInterruptedMigration =
          hasRecoverableSaveFolderMigration(sourceRoot, targetRoot);
        if (
          targetRoot !== path.resolve(defaultDataRoot()) &&
          !recoverableInterruptedMigration &&
          !fs.existsSync(path.join(targetRoot, "worlds"))
        ) {
          assertEmptyOrIdentifiedDataRoot(targetRoot);
        }
        if (
          fs.existsSync(path.join(targetRoot, "worlds")) &&
          !recoverableInterruptedMigration
        ) {
          requireExistingDataRootIdentity(targetRoot);
        }

        const token = randomUUID();
        let stagingRoot: string | null = null;
        let journalStarted = false;
        let stoppedForOperation = false;
        let sourceLock: DataRootLock | null = null;
        let targetLock: DataRootLock | null = null;
        try {
          // stopSim checkpoints first, then releases exclusive ownership, giving
          // the copy a stable source tree including SQLite sidecars.
          await stopSim(5_000, true);
          stoppedForOperation = true;
          sourceLock = acquireDataRootLock(sourceRoot);
          targetLock = acquireDataRootLock(
            targetRoot,
            process.pid,
            recoverableInterruptedMigration,
          );
          if (recoverableInterruptedMigration) {
            await quiesceRecoveredDataRoot(nextSettings, targetLock);
          }
          if (hasRecoverableSaveFolderMigration(sourceRoot, targetRoot)) {
            recoverInterruptedSaveFolderMigration(sourceRoot, targetRoot);
          }
          if (fs.existsSync(path.join(targetRoot, "worlds"))) {
            requireExistingDataRootIdentity(targetRoot);
          } else {
            initializeDataRootIdentity(targetRoot);
          }
          const sourceWorld = inspectSaveFolderMigrationSource(sourceRoot);
          beginSaveFolderMigration(sourceRoot, targetRoot, token);
          journalStarted = true;
          stagingRoot = copyWorldsToStaging(sourceRoot, targetRoot, token);
          fs.renameSync(
            path.join(stagingRoot, "worlds"),
            path.join(targetRoot, "worlds"),
          );
          syncDirectoryBestEffort(targetRoot);
          fs.rmdirSync(stagingRoot);
          stagingRoot = null;
          verifySaveFolderMigrationCopy(targetRoot, sourceWorld);

          // Start from the copied root before making it durable in settings. This
          // proves Rust accepted the same seed/tick and produced a durable
          // checkpoint rather than silently minting a replacement world.
          const handedLock = targetLock;
          targetLock = null;
          const sim = await startSimWithDataRootLock(nextSettings, handedLock);
          if (sourceWorld) {
            await verifyImportedWorldLoaded(
              sim.port,
              path.join(targetRoot, "worlds", "_live"),
              sourceWorld.hash,
              path.join(targetRoot, "worlds", sourceWorld.hash, "world.save"),
              sourceWorld.validated,
            );
          } else {
            await verifyFreshWorldLoaded(sim.port, nextSettings);
          }
          markSaveFolderMigrationVerified(targetRoot, token);
          if (nextSettings.mode !== "local") {
            // Remote mode needed a temporary native process only for validation;
            // retire it before settings can make the target durable.
            await stopSim(5_000, true);
          }
          saveSettings(nextSettings);
          if (nextSettings.mode === "local") {
            await loadLocalRenderer(getWindow, sim.port, { migrated: "1" });
          }
          if (!finishSaveFolderMigration(targetRoot, token)) {
            throw new Error(
              "save migration journal changed before the migration could commit",
            );
          }
          journalStarted = false;
          sourceLock.release();
          sourceLock = null;
          return {
            settings: nextSettings,
            migrated: true,
            previousFolderKept: sourceRoot,
          };
        } catch (error) {
          if (stoppedForOperation) await stopSim().catch(() => {});
          sourceLock?.release();
          sourceLock = null;
          if (stoppedForOperation) saveSettings(priorSettings);
          if (stagingRoot && !journalStarted) {
            fs.rmSync(stagingRoot, { recursive: true, force: true });
          }
          let recoveryError: string | null = null;
          if (journalStarted) {
            try {
              targetLock ??= acquireDataRootLock(targetRoot);
              recoverInterruptedSaveFolderMigration(sourceRoot, targetRoot);
              journalStarted = false;
              stagingRoot = null;
            } catch (recoveryFailure) {
              recoveryError =
                recoveryFailure instanceof Error
                  ? recoveryFailure.message
                  : String(recoveryFailure);
            }
          }
          targetLock?.release();
          targetLock = null;
          const restartError = stoppedForOperation
            ? await restartPriorWorld(priorSettings)
            : null;
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}` +
              (recoveryError
                ? `. The destination rollback remains pending and could not be completed: ${recoveryError}`
                : "") +
              (restartError
                ? `. The original world also failed to restart: ${restartError}`
                : ""),
          );
        } finally {
          sourceLock?.release();
          targetLock?.release();
        }
      },
    ),
  );

  ipc.handle(
    "world:exportActive",
    exclusiveIpcHandler("export the active world", async () => {
      const win = getWindow();
      if (!win) throw new Error("desktop window is unavailable");
      const settings = loadSettings();
      if (settings.mode !== "local")
        throw new Error("switch to local mode before exporting a world");
      if (!(await checkpointActiveSim()))
        throw new Error("could not checkpoint the active world for export");
      const world = activeWorld(settings);
      const result = await dialog.showSaveDialog(win, {
        title: "Export a restorable world save",
        defaultPath: `thehumanbox-${world.hash}.world.save`,
        filters: [{ name: "The Human Box world save", extensions: ["save"] }],
      });
      if (result.canceled || !result.filePath) return { exported: false };
      assertExportOutsideDataRoot(effectiveDataRoot(settings), result.filePath);
      const bytes = fs.readFileSync(world.savePath);
      validateWorldSaveBytes(bytes);
      const replaced = replaceFileForTransaction(
        result.filePath,
        bytes,
        randomUUID(),
      );
      finishReplacedFile(replaced);
      return { exported: true, filePath: result.filePath, hash: world.hash };
    }),
  );

  ipc.handle(
    "world:resetLocal",
    exclusiveIpcHandler("reset the local world", async () => {
      const win = getWindow();
      if (!win) throw new Error("desktop window is unavailable");
      const settings = loadSettings();
      if (settings.mode !== "local")
        throw new Error("switch to local mode before resetting the world");
      if (!(await checkpointActiveSim())) {
        throw new Error("could not checkpoint the active world before reset");
      }
      const world = activeWorld(settings);
      const decision = await dialog.showMessageBox(win, {
        type: "warning",
        title: "Start a new local world?",
        message: "Start a new local world?",
        detail:
          "Your current world will remain archived on this computer. Exporting a separate save first gives you an additional portable backup.",
        buttons: ["Export & start new", "Start new without export", "Cancel"],
        defaultId: 2,
        cancelId: 2,
        noLink: true,
      });
      if (decision.response === 2) return { reset: false };

      let exportPath: string | null = null;
      if (decision.response === 0) {
        const exportChoice = await dialog.showSaveDialog(win, {
          title: "Export current world before reset",
          defaultPath: `thehumanbox-${world.hash}.world.save`,
          filters: [{ name: "The Human Box world save", extensions: ["save"] }],
        });
        if (exportChoice.canceled || !exportChoice.filePath)
          return { reset: false };
        assertExportOutsideDataRoot(
          effectiveDataRoot(settings),
          exportChoice.filePath,
        );
        exportPath = exportChoice.filePath;
      }

      const token = randomUUID();
      const parkedMarker = `${world.markerPath}.reset-${token}`;
      let stoppedForOperation = false;
      let operationLock: DataRootLock | null = null;
      try {
        await stopSim(5_000, true);
        stoppedForOperation = true;
        operationLock = acquireDataRootLock(effectiveDataRoot(settings));
        if (exportPath) {
          assertExportOutsideDataRoot(effectiveDataRoot(settings), exportPath);
          const exportBytes = fs.readFileSync(world.savePath);
          validateWorldSaveBytes(exportBytes);
          const replaced = replaceFileForTransaction(
            exportPath,
            exportBytes,
            token,
          );
          finishReplacedFile(replaced);
        }
        fs.renameSync(world.markerPath, parkedMarker);
        syncDirectoryBestEffort(path.dirname(world.markerPath));
        const handedLock = operationLock;
        operationLock = null;
        const sim = await startSimWithDataRootLock(settings, handedLock);
        await verifyFreshWorldLoaded(sim.port, settings, world.hash);
        await loadLocalRenderer(getWindow, sim.port, { reset: "1" });
        fs.unlinkSync(parkedMarker);
        syncDirectoryBestEffort(path.dirname(world.markerPath));
        return {
          reset: true,
          exported: exportPath !== null,
          filePath: exportPath,
          port: sim.port,
        };
      } catch (error) {
        if (stoppedForOperation) await stopSim().catch(() => {});
        let rollbackError: string | null = null;
        if (fs.existsSync(parkedMarker)) {
          try {
            operationLock ??= acquireDataRootLock(effectiveDataRoot(settings));
            restoreParkedLiveWorld(
              worldsRoot(settings),
              parkedMarker,
              world.hash,
              token,
            );
          } catch (rollbackFailure) {
            rollbackError =
              rollbackFailure instanceof Error
                ? rollbackFailure.message
                : String(rollbackFailure);
          }
        }
        operationLock?.release();
        operationLock = null;
        const restartError = rollbackError
          ? "not attempted because the previous live-world marker is still parked"
          : stoppedForOperation
            ? await restartPriorWorld(settings)
            : null;
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}` +
            (restartError
              ? `. The previous world also failed to restart: ${restartError}`
              : "") +
            (rollbackError
              ? `. The previous live-world marker could not be restored: ${rollbackError}`
              : ""),
        );
      } finally {
        operationLock?.release();
      }
    }),
  );
}
