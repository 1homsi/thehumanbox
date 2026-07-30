import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_REMOTE_SAVE_BYTES = 256 * 1024 * 1024;
export const SUPPORTED_SAVE_SCHEMA_VERSION = 5;
const EXPECTED_GRID_TILES = 600 * 300;
const DATA_ROOT_IDENTITY_NAME = ".thehumanbox-data-root.json";
const DATA_ROOT_IDENTITY_KIND = "thehumanbox-data-root";
const PARKED_WORLDS_PREFIX = ".thehumanbox-migration-parked-worlds-";
const WORLDS_BACKUP_PREFIX = ".thehumanbox-worlds-backup-";
const MAX_U64 = (1n << 64n) - 1n;

export interface ValidatedWorldSave {
  bytes: Buffer;
  version: number;
  tick: number;
  seed: number;
  tickText: string;
  seedText: string;
}

export interface MigrationWorldExpectation {
  hash: string;
  bytes: Buffer;
  validated: ValidatedWorldSave;
}

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

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nonNegativeJsonInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function topLevelUnsignedIntegerText(json: string, key: string): string {
  let depth = 0;
  let previousSignificant = "";
  let found: string | null = null;

  for (let index = 0; index < json.length; index += 1) {
    const character = json[index];
    if (/\s/.test(character)) continue;
    if (character === '"') {
      const stringStart = index;
      index += 1;
      while (index < json.length) {
        if (json[index] === "\\") {
          index += 2;
          continue;
        }
        if (json[index] === '"') break;
        index += 1;
      }
      if (index >= json.length) break; // JSON.parse already reports this.

      if (
        depth === 1 &&
        (previousSignificant === "{" || previousSignificant === ",")
      ) {
        const decodedKey = JSON.parse(
          json.slice(stringStart, index + 1),
        ) as string;
        let valueStart = index + 1;
        while (/\s/.test(json[valueStart] ?? "")) valueStart += 1;
        if (json[valueStart] === ":") {
          valueStart += 1;
          while (/\s/.test(json[valueStart] ?? "")) valueStart += 1;
          if (decodedKey === key) {
            const match = /^(?:0|[1-9]\d*)/.exec(json.slice(valueStart));
            if (!match) {
              throw new Error(`world save has an invalid ${key}`);
            }
            let afterValue = valueStart + match[0].length;
            while (/\s/.test(json[afterValue] ?? "")) afterValue += 1;
            if (json[afterValue] !== "," && json[afterValue] !== "}") {
              throw new Error(`world save has an invalid ${key}`);
            }
            if (found !== null) {
              throw new Error(`world save contains duplicate ${key} fields`);
            }
            found = BigInt(match[0]).toString();
          }
        }
      }
      previousSignificant = '"';
      continue;
    }
    if (character === "{" || character === "[") depth += 1;
    if (character === "}" || character === "]") depth -= 1;
    previousSignificant = character;
  }

  if (found === null) throw new Error(`world save is missing its ${key}`);
  if (BigInt(found) > MAX_U64) {
    throw new Error(`world save ${key} exceeds Rust's u64 range`);
  }
  return found;
}

export function validateWorldSaveBytes(bytes: Uint8Array): ValidatedWorldSave {
  if (bytes.byteLength === 0) throw new Error("world save is empty");
  if (bytes.byteLength > MAX_REMOTE_SAVE_BYTES) {
    throw new Error(
      `world save exceeds the ${MAX_REMOTE_SAVE_BYTES / 1024 / 1024} MiB safety limit`,
    );
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("world save is not valid UTF-8");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `world save is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const save = record(parsed);
  if (!save) throw new Error("world save must contain a JSON object");

  const version = save.version;
  if (!nonNegativeSafeInteger(version))
    throw new Error("world save has an invalid schema version");
  if (version > SUPPORTED_SAVE_SCHEMA_VERSION) {
    throw new Error(
      `world save schema v${version} is newer than this app supports (v${SUPPORTED_SAVE_SCHEMA_VERSION})`,
    );
  }
  if (!nonNegativeJsonInteger(save.tick_count))
    throw new Error("world save has an invalid tick count");
  // Seeds are Rust u64 values and routinely exceed JavaScript's safe-integer
  // range. Validate their JSON representation without rewriting the bytes.
  if (!nonNegativeJsonInteger(save.world_seed))
    throw new Error("world save has an invalid world seed");
  if (!Array.isArray(save.organisms))
    throw new Error("world save is missing its organisms list");
  if (!Array.isArray(save.animals))
    throw new Error("world save is missing its animals list");
  if (!save.organisms.every((organism) => record(organism) !== null)) {
    throw new Error("world save contains an invalid organism record");
  }
  if (!save.animals.every((animal) => record(animal) !== null)) {
    throw new Error("world save contains an invalid animal record");
  }

  const grid = record(save.grid);
  if (!grid || !Array.isArray(grid.tiles))
    throw new Error("world save is missing its terrain grid");
  if (grid.tiles.length !== EXPECTED_GRID_TILES) {
    throw new Error(
      `world save terrain has ${grid.tiles.length} tiles; expected ${EXPECTED_GRID_TILES}`,
    );
  }
  if (
    !grid.tiles.every(
      (tile) =>
        typeof tile === "number" &&
        Number.isInteger(tile) &&
        tile >= -128 &&
        tile <= 127,
    )
  ) {
    throw new Error("world save terrain contains an invalid tile value");
  }

  const tickText = topLevelUnsignedIntegerText(text, "tick_count");
  const seedText = topLevelUnsignedIntegerText(text, "world_seed");

  return {
    bytes: Buffer.from(bytes),
    version,
    tick: save.tick_count,
    seed: save.world_seed,
    tickText,
    seedText,
  };
}

export function assertSameLoadedWorld(
  expected: ValidatedWorldSave,
  actual: ValidatedWorldSave,
): void {
  if (expected.seedText === "0") {
    throw new Error(
      "world save has no stable world seed and cannot be imported safely",
    );
  }
  if (actual.seedText !== expected.seedText) {
    throw new Error(
      `simulation loaded world seed ${actual.seedText}, expected imported seed ${expected.seedText}`,
    );
  }
  if (BigInt(actual.tickText) < BigInt(expected.tickText)) {
    throw new Error(
      `simulation loaded tick ${actual.tickText}, before imported tick ${expected.tickText}`,
    );
  }
}

export async function downloadAndValidateWorldSave(
  rawUrl: string,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<ValidatedWorldSave> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("remote world URL is invalid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("remote world URL must use HTTP or HTTPS");
  }

  const maxBytes = options.maxBytes ?? MAX_REMOTE_SAVE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30_000,
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `failed to fetch remote save: ${response.status} ${response.statusText}`,
      );
    }
    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
      throw new Error(
        `remote save exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MiB safety limit`,
      );
    }
    if (!response.body) throw new Error("remote save response had no body");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        controller.abort();
        throw new Error(
          `remote save exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MiB safety limit`,
        );
      }
      chunks.push(value);
    }

    const bytes = Buffer.allocUnsafe(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return validateWorldSaveBytes(bytes);
  } catch (error) {
    if (
      controller.signal.aborted &&
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new Error("remote world download timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function validateWorldHash(hash: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(hash))
    throw new Error(`invalid world hash: ${hash}`);
}

export function chooseAvailableWorldHash(
  worldsDir: string,
  requested: string,
  now = Date.now(),
): string {
  validateWorldHash(requested);
  if (!fs.existsSync(path.join(worldsDir, requested))) return requested;
  const suffix = `-local-${now.toString(36)}`;
  const base = requested.slice(0, Math.max(1, 64 - suffix.length));
  let candidate = `${base}${suffix}`;
  let attempt = 1;
  while (fs.existsSync(path.join(worldsDir, candidate))) {
    const numbered = `-${attempt++}`;
    candidate = `${base.slice(0, 64 - suffix.length - numbered.length)}${suffix}${numbered}`;
  }
  return candidate;
}

export function syncDirectoryBestEffort(directory: string): void {
  try {
    const fd = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is unavailable on some Windows filesystems.
  }
}

function syncFile(filePath: string): void {
  const fd = fs.openSync(filePath, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function atomicWriteNewFile(
  filePath: string,
  data: string | Uint8Array,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let fd: number | null = null;
  try {
    fd = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tempPath, filePath);
    syncDirectoryBestEffort(path.dirname(filePath));
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* noop */
    }
    throw error;
  }
}

/**
 * Durably replace a small control-plane file. The payload reaches stable
 * storage before the rename, and the parent directory is synced afterwards so
 * a successful return is a usable transaction boundary after power loss.
 */
export function atomicReplaceFile(
  filePath: string,
  data: string | Uint8Array,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.replace`,
  );
  let fd: number | null = null;
  try {
    fd = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tempPath, filePath);
    syncDirectoryBestEffort(path.dirname(filePath));
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* noop */
    }
    throw error;
  }
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

function isRegularNonemptyFile(filePath: string): boolean {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function pathEntryExists(filePath: string): boolean {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function isPlainDirectory(directory: string): boolean {
  try {
    const stat = fs.lstatSync(directory);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
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

export function recoverInterruptedFileReplacement(target: string): void {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) return;
  const base = path.basename(target);
  const candidates = fs.readdirSync(dir);
  const nextFiles = candidates.filter((name) =>
    name.startsWith(`${base}.next-`),
  );
  const rollbackFiles = candidates.filter((name) =>
    name.startsWith(`${base}.rollback-`),
  );
  const newest = (names: string[]) =>
    names
      .map((name) => {
        const candidate = path.join(dir, name);
        const stat = fs.lstatSync(candidate);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(
            `interrupted file replacement has an unsafe rollback entry: ${candidate}`,
          );
        }
        return { name, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)[0]?.name;

  // The caller removes the rollback only after the replacement has been
  // verified. If one survives a crash, the transaction was never committed,
  // even when the prepared file was already renamed over the live marker.
  const rollback = newest(rollbackFiles);
  if (rollback) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.renameSync(path.join(dir, rollback), target);
  }

  for (const name of [...nextFiles, ...rollbackFiles]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate);
      } catch {
        /* leave it for the next guarded startup */
      }
    }
  }

  recoverInterruptedWorldReset(target);
  syncDirectoryBestEffort(dir);
}

/**
 * Reset is committed only when its parked `_live.reset-*` marker is removed.
 * If the desktop process disappears first, restore that marker before Rust is
 * allowed to inspect `_live`; otherwise the simulator can mint and select a
 * fresh world while the player's previous world is merely parked beside it.
 */
export function recoverInterruptedWorldReset(markerPath: string): void {
  const worldsDir = path.dirname(markerPath);
  if (!fs.existsSync(worldsDir)) return;
  const markerName = path.basename(markerPath);
  const prefix = `${markerName}.reset-`;
  const parked = fs
    .readdirSync(worldsDir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => {
      const candidate = path.join(worldsDir, name);
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(
          `interrupted world reset has an unsafe parked marker: ${candidate}`,
        );
      }
      return { name, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const interrupted = parked[0];
  if (!interrupted) return;
  const parkedPath = path.join(worldsDir, interrupted.name);
  const token = interrupted.name.slice(prefix.length);
  if (!token)
    throw new Error("interrupted reset marker has no transaction token");
  const originalHash = fs.readFileSync(parkedPath, "utf8").trim();
  validateWorldHash(originalHash);
  restoreParkedLiveWorld(worldsDir, parkedPath, originalHash, token);

  // Multiple parked markers cannot be produced by the serialized reset flow,
  // but preserve any manually copied/legacy extras without letting a later
  // startup roll the successfully recovered world farther back.
  for (const extra of parked.slice(1)) {
    const source = path.join(worldsDir, extra.name);
    if (!fs.existsSync(source)) continue;
    let destination = path.join(worldsDir, `.${extra.name}.preserved`);
    let suffix = 1;
    while (fs.existsSync(destination)) {
      destination = path.join(
        worldsDir,
        `.${extra.name}.preserved-${suffix++}`,
      );
    }
    fs.renameSync(source, destination);
  }
  syncDirectoryBestEffort(worldsDir);
}

export interface ResetRollbackResult {
  failedHash: string | null;
  quarantinePath: string | null;
}

export function restoreParkedLiveWorld(
  worldsDir: string,
  parkedMarker: string,
  originalHash: string,
  token: string,
): ResetRollbackResult {
  validateWorldHash(originalHash);
  const markerPath = path.join(worldsDir, "_live");
  const parkedHash = fs.readFileSync(parkedMarker, "utf8").trim();
  if (parkedHash !== originalHash) {
    throw new Error(
      `parked live marker changed from ${originalHash} to ${parkedHash}`,
    );
  }

  let failedHash: string | null = null;
  let quarantinePath: string | null = null;
  let failedMarker: string | null = null;
  if (fs.existsSync(markerPath)) {
    const rawFailedHash = fs.readFileSync(markerPath, "utf8").trim();
    try {
      validateWorldHash(rawFailedHash);
      failedHash = rawFailedHash;
    } catch {
      failedHash = null;
    }
    if (failedHash && failedHash !== originalHash) {
      const failedWorldDir = path.join(worldsDir, failedHash);
      if (fs.existsSync(failedWorldDir)) {
        quarantinePath = path.join(
          worldsDir,
          `.failed-reset-${token}-${failedHash}`,
        );
        let suffix = 1;
        while (fs.existsSync(quarantinePath)) {
          quarantinePath = path.join(
            worldsDir,
            `.failed-reset-${token}-${suffix++}-${failedHash}`,
          );
        }
        try {
          fs.renameSync(failedWorldDir, quarantinePath);
        } catch {
          // Marker restoration is more important than moving the failed world.
          // Leaving it under its unique hash still archives it safely because
          // the restored _live marker will no longer select it.
          quarantinePath = null;
        }
      }
    }
    failedMarker = `${markerPath}.failed-reset-${token}`;
    fs.renameSync(markerPath, failedMarker);
  }

  try {
    fs.renameSync(parkedMarker, markerPath);
  } catch (error) {
    if (
      failedMarker &&
      fs.existsSync(failedMarker) &&
      !fs.existsSync(markerPath)
    ) {
      fs.renameSync(failedMarker, markerPath);
    }
    if (quarantinePath && failedHash && fs.existsSync(quarantinePath)) {
      const failedWorldDir = path.join(worldsDir, failedHash);
      if (!fs.existsSync(failedWorldDir))
        fs.renameSync(quarantinePath, failedWorldDir);
    }
    throw error;
  }

  if (failedMarker && fs.existsSync(failedMarker)) {
    if (quarantinePath && fs.existsSync(quarantinePath)) {
      fs.renameSync(failedMarker, path.join(quarantinePath, "_failed_live"));
    } else {
      // Keep even an invalid/unmatched marker for diagnosis without allowing
      // it to become active again.
      const orphanMarker = path.join(worldsDir, `.failed-reset-${token}.live`);
      fs.renameSync(failedMarker, orphanMarker);
    }
  }
  syncDirectoryBestEffort(worldsDir);
  if (quarantinePath) syncDirectoryBestEffort(quarantinePath);
  return { failedHash, quarantinePath };
}

function canonicalPath(input: string): string {
  let existing = path.resolve(input);
  const missing: string[] = [];

  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }

  let canonicalExisting = existing;
  try {
    canonicalExisting = fs.realpathSync.native(existing);
  } catch {
    // The resolved absolute path is still useful if an unusual filesystem
    // does not expose a realpath for its root.
  }
  const canonical = path.resolve(canonicalExisting, ...missing);
  return process.platform === "win32"
    ? canonical.toLocaleLowerCase("en-US")
    : canonical;
}

export function rootsOverlap(a: string, b: string): boolean {
  const normalize = (input: string): string => {
    const resolved = path.resolve(input);
    return process.platform === "win32"
      ? resolved.toLocaleLowerCase("en-US")
      : resolved;
  };
  const isSameOrDescendant = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  };
  const overlaps = (first: string, second: string): boolean =>
    isSameOrDescendant(first, second) || isSameOrDescendant(second, first);

  // Check both names as entered and their existing realpath prefixes. The
  // lexical check prevents a leaf symlink inside a data root from escaping
  // containment checks; the canonical check catches an outside alias that
  // resolves back into the managed root.
  return (
    overlaps(normalize(a), normalize(b)) ||
    overlaps(canonicalPath(a), canonicalPath(b))
  );
}

export function pathsReferToSameLocation(a: string, b: string): boolean {
  return canonicalPath(a) === canonicalPath(b);
}

export function assertExportOutsideDataRoot(
  dataRoot: string,
  destination: string,
): void {
  if (rootsOverlap(dataRoot, destination)) {
    throw new Error(
      "world exports must be saved outside The Human Box data folder",
    );
  }
}

export function assertNoUnmigratedLegacyWorld(sourceRoot: string): void {
  const resolvedSource = path.resolve(sourceRoot);
  if (
    fs.existsSync(path.join(resolvedSource, "world.save")) &&
    !fs.existsSync(path.join(resolvedSource, "worlds", "_live"))
  ) {
    throw new Error(
      "this save folder still contains a legacy world.save; start the local game once to upgrade it before moving the save folder",
    );
  }
}

export function assertNoLegacyWorldAtMigrationTarget(targetRoot: string): void {
  const resolvedTarget = path.resolve(targetRoot);
  const legacySave = path.join(resolvedTarget, "world.save");
  if (fs.existsSync(legacySave)) {
    throw new Error(
      "the selected destination contains a legacy world.save; open that folder as its own save location and upgrade it before using it as a migration destination",
    );
  }
}

/**
 * Capture the stopped source world's exact bytes before any destination tree
 * is created. A data root without a local world is valid, but a legacy
 * root-level save must be upgraded in place first so migration cannot silently
 * strand it and mint an empty world at the destination.
 */
export function inspectSaveFolderMigrationSource(
  sourceRoot: string,
): MigrationWorldExpectation | null {
  const resolvedSource = path.resolve(sourceRoot);
  const markerPath = path.join(resolvedSource, "worlds", "_live");
  assertNoUnmigratedLegacyWorld(resolvedSource);

  if (!pathEntryExists(markerPath)) {
    return null;
  }

  const activeWorld = resolveActiveWorldFiles(resolvedSource);
  const hash = activeWorld.hash;
  const bytes = fs.readFileSync(activeWorld.savePath);
  const validated = validateWorldSaveBytes(bytes);
  if (validated.seedText === "0") {
    throw new Error(
      "the active world has no stable seed and cannot be migrated safely",
    );
  }
  return { hash, bytes, validated };
}

/** Verify the committed destination still contains the exact stopped source. */
export function verifySaveFolderMigrationCopy(
  targetRoot: string,
  expected: MigrationWorldExpectation | null,
): void {
  const markerPath = path.join(path.resolve(targetRoot), "worlds", "_live");
  if (!expected) {
    if (fs.existsSync(markerPath)) {
      throw new Error(
        "the copied save folder unexpectedly selected a live world",
      );
    }
    return;
  }

  const copiedHash = fs.readFileSync(markerPath, "utf8").trim();
  if (copiedHash !== expected.hash) {
    throw new Error(
      `copied live-world marker changed from ${expected.hash} to ${copiedHash}`,
    );
  }
  const copiedBytes = fs.readFileSync(
    path.join(path.resolve(targetRoot), "worlds", expected.hash, "world.save"),
  );
  validateWorldSaveBytes(copiedBytes);
  if (!copiedBytes.equals(expected.bytes)) {
    throw new Error(
      "copied active world does not byte-match the checkpointed source",
    );
  }
}

const MIGRATION_JOURNAL_NAME = ".thehumanbox-migration-journal.json";

interface SaveFolderMigrationJournal {
  version: 2;
  sourceRoot: string;
  targetRoot: string;
  token: string;
  startedAt: number;
  state: "copying" | "verified";
  targetHadWorlds: boolean;
  targetIdentityId: string | null;
}

export interface InterruptedMigrationRecovery {
  recovered: boolean;
  quarantinePath: string | null;
}

function migrationJournalPath(targetRoot: string): string {
  return path.join(path.resolve(targetRoot), MIGRATION_JOURNAL_NAME);
}

function parkedWorldsPath(targetRoot: string, token: string): string {
  return path.join(path.resolve(targetRoot), `${PARKED_WORLDS_PREFIX}${token}`);
}

function completedWorldsBackupPath(targetRoot: string, token: string): string {
  return path.join(path.resolve(targetRoot), `${WORLDS_BACKUP_PREFIX}${token}`);
}

function readSaveFolderMigrationJournal(
  targetRoot: string,
): SaveFolderMigrationJournal | null {
  try {
    const journalStat = fs.lstatSync(migrationJournalPath(targetRoot));
    if (journalStat.isSymbolicLink() || !journalStat.isFile()) return null;
    const parsed = JSON.parse(
      fs.readFileSync(migrationJournalPath(targetRoot), "utf8"),
    ) as Omit<Partial<SaveFolderMigrationJournal>, "version"> & {
      version?: number;
    };
    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      typeof parsed.sourceRoot !== "string" ||
      typeof parsed.targetRoot !== "string" ||
      typeof parsed.token !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.token) ||
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt) ||
      (parsed.state !== undefined &&
        parsed.state !== "copying" &&
        parsed.state !== "verified")
    ) {
      return null;
    }
    if (
      parsed.version === 2 &&
      (typeof parsed.targetHadWorlds !== "boolean" ||
        (parsed.targetIdentityId !== null &&
          typeof parsed.targetIdentityId !== "string"))
    ) {
      return null;
    }
    return {
      version: 2,
      sourceRoot: path.resolve(parsed.sourceRoot),
      targetRoot: path.resolve(parsed.targetRoot),
      token: parsed.token,
      startedAt: parsed.startedAt,
      // Journals from the first transactional implementation had no explicit
      // state. Treat them as unverified rather than inferring commit from the
      // settings path and potentially selecting a rejected destination.
      state: parsed.state === "verified" ? "verified" : "copying",
      // Version-one migrations could only target an empty worlds location.
      targetHadWorlds: parsed.version === 2 && parsed.targetHadWorlds === true,
      targetIdentityId:
        parsed.version === 2 && typeof parsed.targetIdentityId === "string"
          ? parsed.targetIdentityId
          : null,
    };
  } catch {
    return null;
  }
}

export function hasRecoverableSaveFolderMigration(
  sourceRoot: string,
  targetRoot: string,
): boolean {
  const journal = readSaveFolderMigrationJournal(targetRoot);
  return (
    journal !== null &&
    journal.sourceRoot === path.resolve(sourceRoot) &&
    journal.targetRoot === path.resolve(targetRoot)
  );
}

export function beginSaveFolderMigration(
  sourceRoot: string,
  targetRoot: string,
  token: string,
): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token))
    throw new Error("invalid save migration token");
  const resolvedSource = path.resolve(sourceRoot);
  const resolvedTarget = path.resolve(targetRoot);
  if (rootsOverlap(resolvedSource, resolvedTarget)) {
    throw new Error(
      "the new save folder cannot overlap the current save folder",
    );
  }
  fs.mkdirSync(resolvedTarget, { recursive: true });
  const journalPath = migrationJournalPath(resolvedTarget);
  if (fs.existsSync(journalPath)) {
    throw new Error(
      "the selected folder has an unfinished save migration that must be recovered",
    );
  }
  const targetWorlds = path.join(resolvedTarget, "worlds");
  const targetHadWorlds = fs.existsSync(targetWorlds);
  if (targetHadWorlds) {
    const targetWorldsStat = fs.lstatSync(targetWorlds);
    if (targetWorldsStat.isSymbolicLink() || !targetWorldsStat.isDirectory()) {
      throw new Error(
        "identified migration destination has an unsafe worlds entry",
      );
    }
  }
  const targetIdentityId = targetHadWorlds
    ? requireExistingDataRootIdentity(resolvedTarget).id
    : null;
  const parkedWorlds = parkedWorldsPath(resolvedTarget, token);
  const completedBackup = completedWorldsBackupPath(resolvedTarget, token);
  if (fs.existsSync(parkedWorlds) || fs.existsSync(completedBackup)) {
    throw new Error(
      "the selected folder already contains rollback data for this migration token",
    );
  }
  atomicWriteNewFile(
    journalPath,
    JSON.stringify({
      version: 2,
      sourceRoot: resolvedSource,
      targetRoot: resolvedTarget,
      token,
      startedAt: Date.now(),
      state: "copying",
      targetHadWorlds,
      targetIdentityId,
    } satisfies SaveFolderMigrationJournal),
  );
  if (targetHadWorlds) {
    try {
      fs.renameSync(targetWorlds, parkedWorlds);
      syncDirectoryBestEffort(resolvedTarget);
    } catch (error) {
      // If the rename happened but the following directory sync failed, put
      // the destination back before forgetting the journal.
      if (fs.existsSync(parkedWorlds) && !fs.existsSync(targetWorlds)) {
        fs.renameSync(parkedWorlds, targetWorlds);
      }
      fs.unlinkSync(journalPath);
      syncDirectoryBestEffort(resolvedTarget);
      throw error;
    }
  }
}

export function markSaveFolderMigrationVerified(
  targetRoot: string,
  token: string,
): void {
  const journal = readSaveFolderMigrationJournal(targetRoot);
  if (!journal || journal.token !== token) {
    throw new Error(
      "save migration journal changed before runtime verification completed",
    );
  }
  if (journal.state === "verified") return;
  atomicReplaceFile(
    migrationJournalPath(targetRoot),
    JSON.stringify({
      ...journal,
      state: "verified",
    } satisfies SaveFolderMigrationJournal),
  );
}

function uniqueInterruptedMigrationPath(
  targetRoot: string,
  token: string,
): string {
  const base = path.join(
    targetRoot,
    `.thehumanbox-interrupted-migration-${token}`,
  );
  let candidate = base;
  let suffix = 1;
  while (fs.existsSync(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export function recoverInterruptedSaveFolderMigration(
  sourceRoot: string,
  targetRoot: string,
): InterruptedMigrationRecovery {
  const resolvedSource = path.resolve(sourceRoot);
  const resolvedTarget = path.resolve(targetRoot);
  const journalPath = migrationJournalPath(resolvedTarget);
  const journal = readSaveFolderMigrationJournal(resolvedTarget);
  if (!journal)
    throw new Error(
      "the selected folder has no valid interrupted save migration",
    );
  if (
    journal.sourceRoot !== resolvedSource ||
    journal.targetRoot !== resolvedTarget
  ) {
    throw new Error(
      "the interrupted save migration belongs to a different source folder",
    );
  }
  if (journal.targetHadWorlds) {
    const identity = requireExistingDataRootIdentity(resolvedTarget);
    if (!journal.targetIdentityId || identity.id !== journal.targetIdentityId) {
      throw new Error(
        "the interrupted save migration destination identity has changed",
      );
    }
  }

  const targetWorlds = path.join(resolvedTarget, "worlds");
  const stagingRoot = path.join(
    resolvedTarget,
    `.thehumanbox-migration-${journal.token}`,
  );
  const parkedWorlds = parkedWorldsPath(resolvedTarget, journal.token);
  const completedBackup = completedWorldsBackupPath(
    resolvedTarget,
    journal.token,
  );
  const rollbackWorlds = fs.existsSync(parkedWorlds)
    ? parkedWorlds
    : fs.existsSync(completedBackup)
      ? completedBackup
      : null;
  if (
    journal.targetHadWorlds &&
    !rollbackWorlds &&
    !fs.existsSync(targetWorlds)
  ) {
    throw new Error(
      "the interrupted save migration lost both its live and parked destination worlds",
    );
  }

  // A rollback slot proves any current target worlds are the incoming,
  // uncommitted copy. Without one, a v2 targetHadWorlds journal crashed before
  // parking (or after a completed restore), so its live tree must stay put.
  const quarantineTargetWorlds =
    fs.existsSync(targetWorlds) &&
    (!journal.targetHadWorlds || rollbackWorlds !== null);
  const quarantineStaging = fs.existsSync(stagingRoot);
  let quarantinePath: string | null = null;
  if (quarantineTargetWorlds || quarantineStaging) {
    quarantinePath = uniqueInterruptedMigrationPath(
      resolvedTarget,
      journal.token,
    );
    fs.mkdirSync(quarantinePath);
    fs.copyFileSync(
      journalPath,
      path.join(quarantinePath, "migration-journal.json"),
    );
    if (quarantineTargetWorlds) {
      fs.renameSync(targetWorlds, path.join(quarantinePath, "worlds"));
    }
    if (quarantineStaging) {
      fs.renameSync(stagingRoot, path.join(quarantinePath, "staging"));
    }
  }

  if (rollbackWorlds) {
    if (fs.existsSync(targetWorlds)) {
      throw new Error(
        "could not clear the uncommitted destination worlds before rollback",
      );
    }
    fs.renameSync(rollbackWorlds, targetWorlds);
  }

  fs.unlinkSync(journalPath);
  syncDirectoryBestEffort(resolvedTarget);
  return { recovered: true, quarantinePath };
}

function preserveParkedWorldsBackup(
  targetRoot: string,
  journal: SaveFolderMigrationJournal,
): void {
  if (!journal.targetHadWorlds) return;
  const identity = requireExistingDataRootIdentity(targetRoot);
  if (!journal.targetIdentityId || identity.id !== journal.targetIdentityId) {
    throw new Error(
      "save migration destination identity changed before commit",
    );
  }

  const parkedWorlds = parkedWorldsPath(targetRoot, journal.token);
  const completedBackup = completedWorldsBackupPath(targetRoot, journal.token);
  if (fs.existsSync(parkedWorlds)) {
    if (fs.existsSync(completedBackup)) {
      throw new Error(
        "save migration has two competing destination-world backups",
      );
    }
    fs.renameSync(parkedWorlds, completedBackup);
    syncDirectoryBestEffort(path.resolve(targetRoot));
    return;
  }
  if (!fs.existsSync(completedBackup)) {
    throw new Error("save migration destination-world backup is missing");
  }
}

export function finishSaveFolderMigration(
  targetRoot: string,
  token: string,
): boolean {
  const journal = readSaveFolderMigrationJournal(targetRoot);
  if (!journal || journal.token !== token) return false;
  if (journal.state !== "verified") {
    throw new Error(
      "cannot commit migrated worlds before runtime verification",
    );
  }
  if (!fs.existsSync(path.join(path.resolve(targetRoot), "worlds"))) {
    throw new Error(
      "cannot commit migrated worlds without a live destination copy",
    );
  }
  preserveParkedWorldsBackup(targetRoot, journal);
  fs.unlinkSync(migrationJournalPath(targetRoot));
  syncDirectoryBestEffort(path.resolve(targetRoot));
  return true;
}

/**
 * Settings are written only after the staged `worlds` directory is fully
 * renamed into place. If the app crashes after that settings commit but before
 * deleting the journal, opening this exact root is proof that the migration
 * committed; finish it instead of quarantining the now-active world on a later
 * retry.
 */
export function finishCommittedMigrationForActiveRoot(
  targetRoot: string,
): boolean {
  const resolvedTarget = path.resolve(targetRoot);
  const journal = readSaveFolderMigrationJournal(resolvedTarget);
  if (!journal) {
    if (pathEntryExists(migrationJournalPath(resolvedTarget))) {
      throw new Error(
        "active save folder has an unreadable or invalid migration journal",
      );
    }
    return false;
  }
  if (journal.targetRoot !== resolvedTarget) {
    throw new Error(
      "active save folder migration journal belongs to a different path",
    );
  }
  if (journal.state !== "verified") {
    throw new Error(
      "active save folder has an unverified migration; refusing to select it until the original folder is restored",
    );
  }
  if (!fs.existsSync(path.join(resolvedTarget, "worlds"))) {
    throw new Error(
      "active save folder has an unfinished migration without a worlds directory",
    );
  }
  preserveParkedWorldsBackup(resolvedTarget, journal);
  fs.unlinkSync(migrationJournalPath(resolvedTarget));
  syncDirectoryBestEffort(resolvedTarget);
  return true;
}

export function copyWorldsToStaging(
  sourceRoot: string,
  targetRoot: string,
  token: string,
): string {
  const sourceWorlds = path.join(sourceRoot, "worlds");
  const targetWorlds = path.join(targetRoot, "worlds");
  if (rootsOverlap(sourceRoot, targetRoot)) {
    throw new Error(
      "the new save folder cannot overlap the current save folder",
    );
  }
  assertNoUnmigratedLegacyWorld(sourceRoot);
  assertNoLegacyWorldAtMigrationTarget(targetRoot);
  if (fs.existsSync(targetWorlds)) {
    throw new Error(
      "the selected folder already contains The Human Box worlds; choose an empty folder",
    );
  }

  fs.mkdirSync(targetRoot, { recursive: true });
  const stagingRoot = path.join(targetRoot, `.thehumanbox-migration-${token}`);
  const stagingWorlds = path.join(stagingRoot, "worlds");
  fs.mkdirSync(stagingRoot, { recursive: false });
  try {
    if (fs.existsSync(sourceWorlds)) {
      copyTreeWithoutLinks(sourceWorlds, stagingWorlds);
    } else {
      fs.mkdirSync(stagingWorlds);
      syncDirectoryBestEffort(stagingWorlds);
    }
    syncDirectoryBestEffort(stagingRoot);
    return stagingRoot;
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

function copyTreeWithoutLinks(source: string, target: string): void {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink())
    throw new Error(`save migration refused symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(target);
    for (const entry of fs.readdirSync(source)) {
      copyTreeWithoutLinks(path.join(source, entry), path.join(target, entry));
    }
    syncDirectoryBestEffort(target);
    return;
  }
  if (!stat.isFile())
    throw new Error(`save migration refused special file: ${source}`);
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  syncFile(target);
}
