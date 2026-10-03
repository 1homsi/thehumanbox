import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteNewFile, isPlainDirectory, isRegularNonemptyFile } from "./atomic-files";
import { validateWorldHash, validateWorldSaveBytes } from "./save-validation";

const DATA_ROOT_IDENTITY_NAME = ".thehumanbox-data-root.json";

const DATA_ROOT_IDENTITY_KIND = "thehumanbox-data-root";

export interface DataRootIdentity {
  kind: typeof DATA_ROOT_IDENTITY_KIND;
  version: 1;
  id: string;
  createdAt: number;
}

export interface ActiveWorldFiles {
  hash: string;
  savePath: string;
  markerPath: string;
}

function dataRootIdentityPath(root: string): string {
  return path.join(path.resolve(root), DATA_ROOT_IDENTITY_NAME);
}

function parseDataRootIdentity(root: string): DataRootIdentity {
  const markerPath = dataRootIdentityPath(root);
  let parsed: Partial<DataRootIdentity>;
  try {
    const markerStat = fs.lstatSync(markerPath);
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
      throw new Error("identity marker is not a regular file");
    }
    parsed = JSON.parse(
      fs.readFileSync(markerPath, "utf8"),
    ) as Partial<DataRootIdentity>;
  } catch (error) {
    throw new Error(
      `save folder identity is unreadable at ${markerPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    parsed.kind !== DATA_ROOT_IDENTITY_KIND ||
    parsed.version !== 1 ||
    typeof parsed.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.id) ||
    typeof parsed.createdAt !== "number" ||
    !Number.isFinite(parsed.createdAt)
  ) {
    throw new Error(`save folder identity is invalid at ${markerPath}`);
  }
  return parsed as DataRootIdentity;
}

export function resolveActiveWorldFiles(root: string): ActiveWorldFiles {
  const worldsDir = path.join(path.resolve(root), "worlds");
  if (!isPlainDirectory(worldsDir)) {
    throw new Error("worlds path is missing or is not a regular directory");
  }
  const markerPath = path.join(worldsDir, "_live");
  if (!isRegularNonemptyFile(markerPath)) {
    throw new Error("live-world marker is missing or is not a regular file");
  }
  const hash = fs.readFileSync(markerPath, "utf8").trim();
  validateWorldHash(hash);
  const worldDir = path.join(worldsDir, hash);
  if (!isPlainDirectory(worldDir)) {
    throw new Error(`active world ${hash} is not a regular directory`);
  }
  const savePath = path.join(worldDir, "world.save");
  if (!isRegularNonemptyFile(savePath)) {
    throw new Error(`active world ${hash} has no regular world.save file`);
  }
  return { hash, savePath, markerPath };
}

function containsRecognizableExistingWorld(root: string): boolean {
  const legacySave = path.join(root, "world.save");
  if (isRegularNonemptyFile(legacySave)) {
    try {
      validateWorldSaveBytes(fs.readFileSync(legacySave));
      return true;
    } catch {
      // Continue looking for a current-format worlds tree.
    }
  }

  const worldsDir = path.join(root, "worlds");
  let entries: string[];
  try {
    if (!fs.lstatSync(worldsDir).isDirectory()) return false;
    entries = fs.readdirSync(worldsDir);
  } catch {
    return false;
  }

  const hashes = new Set<string>();
  try {
    if (!isRegularNonemptyFile(path.join(worldsDir, "_live"))) {
      throw new Error("unsafe live marker");
    }
    const liveHash = fs
      .readFileSync(path.join(worldsDir, "_live"), "utf8")
      .trim();
    validateWorldHash(liveHash);
    hashes.add(liveHash);
  } catch {
    // An interrupted reset may have no live marker, so archived world folders
    // below remain valid evidence that this was an existing app-owned root.
  }
  for (const entry of entries) {
    try {
      validateWorldHash(entry);
      hashes.add(entry);
    } catch {
      /* control files and quarantine folders are not world hashes */
    }
  }

  for (const hash of hashes) {
    if (!isPlainDirectory(path.join(worldsDir, hash))) continue;
    const savePath = path.join(worldsDir, hash, "world.save");
    if (!isRegularNonemptyFile(savePath)) continue;
    try {
      validateWorldSaveBytes(fs.readFileSync(savePath));
      return true;
    } catch {
      // Do not bless an unidentified folder solely because it contains a file
      // with the expected name; at least one native save must decode safely.
    }
  }
  return false;
}

/** Create (or validate) the durable marker for a root the app explicitly owns. */
export function initializeDataRootIdentity(root: string): DataRootIdentity {
  const resolvedRoot = path.resolve(root);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch {
    throw new Error(`save folder does not exist: ${resolvedRoot}`);
  }
  if (!stat.isDirectory())
    throw new Error(`save folder is not a directory: ${resolvedRoot}`);

  const markerPath = dataRootIdentityPath(resolvedRoot);
  if (fs.existsSync(markerPath)) return parseDataRootIdentity(resolvedRoot);
  const identity: DataRootIdentity = {
    kind: DATA_ROOT_IDENTITY_KIND,
    version: 1,
    id: randomUUID(),
    createdAt: Date.now(),
  };
  atomicWriteNewFile(markerPath, JSON.stringify(identity));
  return identity;
}

/**
 * Require a marker that predates this operation. Migration may initialize an
 * empty destination, but it must never bless and replace an unidentified
 * folder merely because that folder happens to contain a `worlds` directory.
 */
export function requireExistingDataRootIdentity(
  root: string,
): DataRootIdentity {
  const resolvedRoot = path.resolve(root);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch {
    throw new Error(`save folder does not exist: ${resolvedRoot}`);
  }
  if (!stat.isDirectory())
    throw new Error(`save folder is not a directory: ${resolvedRoot}`);
  if (!fs.existsSync(dataRootIdentityPath(resolvedRoot))) {
    throw new Error(
      `save folder contains worlds but has no existing The Human Box data-root identity: ${resolvedRoot}`,
    );
  }
  return parseDataRootIdentity(resolvedRoot);
}

/**
 * A newly selected custom destination may be initialized only when it is
 * empty. A pre-identified app root can be reused even if its worlds are
 * currently parked or backed up, but arbitrary nonempty folders must never be
 * silently claimed as game storage.
 */
export function assertEmptyOrIdentifiedDataRoot(root: string): void {
  const resolvedRoot = path.resolve(root);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch {
    throw new Error(`save folder does not exist: ${resolvedRoot}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`save folder is not a directory: ${resolvedRoot}`);
  }
  if (fs.existsSync(dataRootIdentityPath(resolvedRoot))) {
    requireExistingDataRootIdentity(resolvedRoot);
    return;
  }
  if (fs.readdirSync(resolvedRoot).length > 0) {
    throw new Error(
      "the selected custom save folder is not empty and has no existing The Human Box data-root identity",
    );
  }
}

/**
 * Open an explicit override without ever creating it. Roots from older desktop
 * versions are upgraded only when a valid native world proves their identity.
 */
export function requireOrUpgradeDataRootIdentity(
  root: string,
): DataRootIdentity {
  const resolvedRoot = path.resolve(root);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch {
    throw new Error(
      `configured save folder is unavailable: ${resolvedRoot}. Reconnect or restore the folder, then retry.`,
    );
  }
  if (!stat.isDirectory())
    throw new Error(
      `configured save folder is not a directory: ${resolvedRoot}`,
    );

  const markerPath = dataRootIdentityPath(resolvedRoot);
  if (fs.existsSync(markerPath)) return parseDataRootIdentity(resolvedRoot);
  if (!containsRecognizableExistingWorld(resolvedRoot)) {
    throw new Error(
      `configured save folder is empty or is not recognized as The Human Box data: ${resolvedRoot}`,
    );
  }
  return initializeDataRootIdentity(resolvedRoot);
}
