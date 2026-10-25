import * as fs from "node:fs";
import * as path from "node:path";
import { Worker } from "node:worker_threads";

export const MAX_REMOTE_SAVE_BYTES = 256 * 1024 * 1024;

export const SUPPORTED_SAVE_SCHEMA_VERSION = 7;

const EXPECTED_GRID_TILES = 800 * 400;
const LEGACY_GRID_TILES = 600 * 300;

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

const UNSIGNED_INTEGER_TOKEN = /(?:0|[1-9]\d*)/y;

// Character codes the top-level scan branches on. It only runs on text that
// JSON.parse has already accepted, so whitespace is the four JSON characters.
const CH_QUOTE = 0x22;
const CH_BACKSLASH = 0x5c;
const CH_COMMA = 0x2c;
const CH_COLON = 0x3a;
const CH_OPEN_BRACE = 0x7b;
const CH_CLOSE_BRACE = 0x7d;
const CH_OPEN_BRACKET = 0x5b;
const CH_CLOSE_BRACKET = 0x5d;

function isJsonWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * Read the top-level unsigned-integer fields `keys` in one pass over the save
 * text, keeping each value's digits as written. A key that is missing, repeated,
 * not followed by a plain integer, or outside Rust's u64 range is an error. The
 * errors are raised in `keys` order, the same order a per-key scan would give.
 */
function topLevelUnsignedIntegerTexts(
  json: string,
  keys: readonly string[],
): Record<string, string> {
  const found = new Map<string, string>();
  const problems = new Map<string, string>();
  const length = json.length;
  let depth = 0;
  let previous = 0;
  let index = 0;

  while (index < length) {
    const code = json.charCodeAt(index);
    if (isJsonWhitespace(code)) {
      index += 1;
      continue;
    }
    if (code === CH_QUOTE) {
      const stringStart = index;
      index += 1;
      while (index < length) {
        const inner = json.charCodeAt(index);
        if (inner === CH_BACKSLASH) {
          index += 2;
          continue;
        }
        if (inner === CH_QUOTE) break;
        index += 1;
      }
      if (index >= length) break; // JSON.parse already reports this.

      if (depth === 1 && (previous === CH_OPEN_BRACE || previous === CH_COMMA)) {
        const decodedKey = JSON.parse(json.slice(stringStart, index + 1)) as string;
        let valueStart = index + 1;
        while (valueStart < length && isJsonWhitespace(json.charCodeAt(valueStart))) valueStart += 1;
        if (json.charCodeAt(valueStart) === CH_COLON && keys.includes(decodedKey)) {
          valueStart += 1;
          while (valueStart < length && isJsonWhitespace(json.charCodeAt(valueStart))) valueStart += 1;
          UNSIGNED_INTEGER_TOKEN.lastIndex = valueStart;
          const match = UNSIGNED_INTEGER_TOKEN.exec(json);
          if (!match) {
            if (!problems.has(decodedKey)) problems.set(decodedKey, `world save has an invalid ${decodedKey}`);
          } else {
            let afterValue = valueStart + match[0].length;
            while (afterValue < length && isJsonWhitespace(json.charCodeAt(afterValue))) afterValue += 1;
            const after = json.charCodeAt(afterValue);
            if (after !== CH_COMMA && after !== CH_CLOSE_BRACE) {
              if (!problems.has(decodedKey)) problems.set(decodedKey, `world save has an invalid ${decodedKey}`);
            } else if (found.has(decodedKey)) {
              if (!problems.has(decodedKey)) problems.set(decodedKey, `world save contains duplicate ${decodedKey} fields`);
            } else {
              found.set(decodedKey, BigInt(match[0]).toString());
            }
          }
        }
      }
      previous = CH_QUOTE;
      index += 1;
      continue;
    }
    if (code === CH_OPEN_BRACE || code === CH_OPEN_BRACKET) depth += 1;
    if (code === CH_CLOSE_BRACE || code === CH_CLOSE_BRACKET) depth -= 1;
    previous = code;
    index += 1;
  }

  const values: Record<string, string> = {};
  for (const key of keys) {
    const problem = problems.get(key);
    if (problem !== undefined) throw new Error(problem);
    const value = found.get(key);
    if (value === undefined) throw new Error(`world save is missing its ${key}`);
    if (BigInt(value) > MAX_U64) {
      throw new Error(`world save ${key} exceeds Rust's u64 range`);
    }
    values[key] = value;
  }
  return values;
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
  if (
    grid.tiles.length !== EXPECTED_GRID_TILES &&
    grid.tiles.length !== LEGACY_GRID_TILES
  ) {
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

  const { tick_count: tickText, world_seed: seedText } = topLevelUnsignedIntegerTexts(text, [
    "tick_count",
    "world_seed",
  ]);

  return {
    bytes: Buffer.from(bytes),
    version,
    tick: save.tick_count,
    seed: save.world_seed,
    tickText,
    seedText,
  };
}

/** Validate a save away from Electron's main thread for user-triggered file operations. */
export function validateWorldSaveBytesInWorker(
  bytes: Uint8Array,
): Promise<ValidatedWorldSave> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "save-validation-worker.js"), {
      workerData: bytes,
    });
    let settled = false;
    worker.once("message", (result: Omit<ValidatedWorldSave, "bytes"> & { error?: string }) => {
      settled = true;
      if (result.error) {
        reject(new Error(result.error));
        return;
      }
      resolve({
        ...result,
        bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      });
    });
    worker.once("error", (error) => {
      settled = true;
      reject(error);
    });
    worker.once("exit", (code) => {
      if (!settled) {
        reject(new Error(`world-save validation worker exited with code ${code}`));
      }
    });
  });
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
