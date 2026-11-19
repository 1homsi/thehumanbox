import * as zlib from "node:zlib";

export const SAVE_MAGIC = [0x89, 0x54, 0x48, 0x42] as const;
export const SAVE_CONTAINER_VERSION = 1;
export const SAVE_HEADER_BYTES = 6;
export const SaveCodec = { Raw: 0, Gzip: 1 } as const;

const GZIP_MAGIC = [0x1f, 0x8b] as const;
const COMPACT_MAGIC = "THBSAVE";
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

export type StoredSaveFormat = "container" | "gzip" | "plain";

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.byteLength >= prefix.length && prefix.every((b, i) => bytes[i] === b);
}

export function storedSaveFormat(bytes: Uint8Array): StoredSaveFormat {
  if (startsWith(bytes, SAVE_MAGIC)) return "container";
  if (startsWith(bytes, GZIP_MAGIC)) return "gzip";
  return "plain";
}

function gunzip(bytes: Uint8Array): Uint8Array {
  try {
    return zlib.gunzipSync(bytes, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch (error) {
    throw new Error(
      `world save could not be decompressed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function unpackWorldSave(bytes: Uint8Array): Uint8Array {
  const format = storedSaveFormat(bytes);
  if (format === "plain") return bytes;
  if (format === "gzip") return gunzip(bytes);
  if (bytes.byteLength < SAVE_HEADER_BYTES) throw new Error("world save container is cut short");
  const version = bytes[4];
  const codec = bytes[5];
  if (version !== SAVE_CONTAINER_VERSION) {
    throw new Error(
      `world save container v${version} is newer than this app reads (v${SAVE_CONTAINER_VERSION})`,
    );
  }
  const payload = bytes.subarray(SAVE_HEADER_BYTES);
  if (codec === SaveCodec.Raw) return payload;
  if (codec === SaveCodec.Gzip) return gunzip(payload);
  throw new Error(`world save container has an unknown codec ${codec}`);
}

export function compactSaveVersion(bytes: Uint8Array): number | null {
  if (bytes.byteLength < COMPACT_MAGIC.length + 1) return null;
  for (let i = 0; i < COMPACT_MAGIC.length; i++) {
    if (bytes[i] !== COMPACT_MAGIC.charCodeAt(i)) return null;
  }
  const version = bytes[COMPACT_MAGIC.length];
  return version === 1 || version === 2 ? version : null;
}

class MsgpackReader {
  private readonly view: DataView;
  pos: number;

  constructor(
    private readonly bytes: Uint8Array,
    start: number,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = start;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.byteLength) throw new Error("world save ends in the middle of a value");
  }

  private u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }

  private uint(width: 1 | 2 | 4 | 8): bigint {
    this.need(width);
    const at = this.pos;
    this.pos += width;
    if (width === 1) return BigInt(this.view.getUint8(at));
    if (width === 2) return BigInt(this.view.getUint16(at));
    if (width === 4) return BigInt(this.view.getUint32(at));
    return this.view.getBigUint64(at);
  }

  private int(width: 1 | 2 | 4 | 8): bigint {
    this.need(width);
    const at = this.pos;
    this.pos += width;
    if (width === 1) return BigInt(this.view.getInt8(at));
    if (width === 2) return BigInt(this.view.getInt16(at));
    if (width === 4) return BigInt(this.view.getInt32(at));
    return this.view.getBigInt64(at);
  }

  private len(width: 1 | 2 | 4): number {
    return Number(this.uint(width));
  }

  peek(): number {
    this.need(1);
    return this.bytes[this.pos];
  }

  arrayLength(): number | null {
    const tag = this.peek();
    if (tag >= 0x90 && tag <= 0x9f) {
      this.pos += 1;
      return tag & 0x0f;
    }
    if (tag === 0xdc || tag === 0xdd) {
      this.pos += 1;
      return this.len(tag === 0xdc ? 2 : 4);
    }
    return null;
  }

  mapLength(): number | null {
    const tag = this.peek();
    if (tag >= 0x80 && tag <= 0x8f) {
      this.pos += 1;
      return tag & 0x0f;
    }
    if (tag === 0xde || tag === 0xdf) {
      this.pos += 1;
      return this.len(tag === 0xde ? 2 : 4);
    }
    return null;
  }

  string(): string | null {
    const tag = this.peek();
    let length: number;
    if (tag >= 0xa0 && tag <= 0xbf) {
      this.pos += 1;
      length = tag & 0x1f;
    } else if (tag >= 0xd9 && tag <= 0xdb) {
      this.pos += 1;
      length = this.len(tag === 0xd9 ? 1 : tag === 0xda ? 2 : 4);
    } else {
      return null;
    }
    this.need(length);
    const text = Buffer.from(this.bytes.buffer, this.bytes.byteOffset + this.pos, length).toString("utf8");
    this.pos += length;
    return text;
  }

  integer(): bigint | null {
    const tag = this.peek();
    if (tag <= 0x7f) {
      this.pos += 1;
      return BigInt(tag);
    }
    if (tag >= 0xe0) {
      this.pos += 1;
      return BigInt(tag - 0x100);
    }
    if (tag >= 0xcc && tag <= 0xcf) {
      this.pos += 1;
      return this.uint(([1, 2, 4, 8] as const)[tag - 0xcc]);
    }
    if (tag >= 0xd0 && tag <= 0xd3) {
      this.pos += 1;
      return this.int(([1, 2, 4, 8] as const)[tag - 0xd0]);
    }
    return null;
  }

  skip(): void {
    const tag = this.u8();
    if (tag <= 0x7f || tag >= 0xe0 || tag === 0xc0 || tag === 0xc2 || tag === 0xc3) return;
    if (tag >= 0x80 && tag <= 0x8f) return this.skipMany((tag & 0x0f) * 2);
    if (tag >= 0x90 && tag <= 0x9f) return this.skipMany(tag & 0x0f);
    if (tag >= 0xa0 && tag <= 0xbf) return this.advance(tag & 0x1f);
    switch (tag) {
      case 0xc4:
      case 0xd9:
        return this.advance(this.len(1));
      case 0xc5:
      case 0xda:
        return this.advance(this.len(2));
      case 0xc6:
      case 0xdb:
        return this.advance(this.len(4));
      case 0xc7:
        return this.advance(this.len(1) + 1);
      case 0xc8:
        return this.advance(this.len(2) + 1);
      case 0xc9:
        return this.advance(this.len(4) + 1);
      case 0xca:
        return this.advance(4);
      case 0xcb:
        return this.advance(8);
      case 0xcc:
      case 0xd0:
        return this.advance(1);
      case 0xcd:
      case 0xd1:
        return this.advance(2);
      case 0xce:
      case 0xd2:
        return this.advance(4);
      case 0xcf:
      case 0xd3:
        return this.advance(8);
      case 0xd4:
        return this.advance(2);
      case 0xd5:
        return this.advance(3);
      case 0xd6:
        return this.advance(5);
      case 0xd7:
        return this.advance(9);
      case 0xd8:
        return this.advance(17);
      case 0xdc:
        return this.skipMany(this.len(2));
      case 0xdd:
        return this.skipMany(this.len(4));
      case 0xde:
        return this.skipMany(this.len(2) * 2);
      case 0xdf:
        return this.skipMany(this.len(4) * 2);
      default:
        throw new Error(`world save has an unreadable value (0x${tag.toString(16)})`);
    }
  }

  private advance(n: number): void {
    this.need(n);
    this.pos += n;
  }

  private skipMany(n: number): void {
    for (let i = 0; i < n; i++) this.skip();
  }
}

export interface CompactSaveSummary {
  version: number;
  tickText: string;
  seedText: string;
  organismsAreRecords: boolean;
  animalsAreRecords: boolean;
  tiles: number;
  tilesInRange: boolean;
}

function recordList(reader: MsgpackReader): boolean | null {
  const length = reader.arrayLength();
  if (length === null) return null;
  let records = true;
  for (let i = 0; i < length; i++) {
    if (reader.peek() < 0x80 || (reader.peek() > 0x8f && reader.peek() !== 0xde && reader.peek() !== 0xdf)) {
      records = false;
    }
    reader.skip();
  }
  return records;
}

function readGridTiles(reader: MsgpackReader): { tiles: number; inRange: boolean } | null {
  const fields = reader.mapLength();
  if (fields === null) return null;
  let found: { tiles: number; inRange: boolean } | null = null;
  for (let i = 0; i < fields; i++) {
    const key = reader.string();
    if (key === null) throw new Error("world save grid has a field without a name");
    if (key !== "tiles") {
      reader.skip();
      continue;
    }
    const length = reader.arrayLength();
    if (length === null) return null;
    let inRange = true;
    for (let t = 0; t < length; t++) {
      const value = reader.integer();
      if (value === null || value < -128n || value > 127n) {
        inRange = false;
        if (value === null) reader.skip();
      }
    }
    found = { tiles: length, inRange };
  }
  return found;
}

export function readCompactSave(bytes: Uint8Array): CompactSaveSummary {
  const reader = new MsgpackReader(bytes, COMPACT_MAGIC.length + 1);
  if (reader.arrayLength() !== 2) throw new Error("world save has an unknown layout");
  reader.skip();
  const fields = reader.mapLength();
  if (fields === null) throw new Error("world save must contain a record");
  const seen = new Map<string, unknown>();
  for (let i = 0; i < fields; i++) {
    const key = reader.string();
    if (key === null) throw new Error("world save has a field without a name");
    if (seen.has(key)) throw new Error(`world save contains duplicate ${key} fields`);
    if (key === "version" || key === "tick_count" || key === "world_seed") {
      const value = reader.integer();
      if (value === null || value < 0n) {
        seen.set(key, null);
        reader.skip();
      } else {
        seen.set(key, value);
      }
    } else if (key === "organisms" || key === "animals") {
      seen.set(key, recordList(reader));
    } else if (key === "grid") {
      seen.set(key, readGridTiles(reader));
    } else {
      reader.skip();
    }
  }
  const integer = (key: string, what: string): bigint => {
    const value = seen.get(key);
    if (typeof value !== "bigint") throw new Error(`world save has an invalid ${what}`);
    return value;
  };
  const version = integer("version", "schema version");
  const tick = integer("tick_count", "tick count");
  const seed = integer("world_seed", "world seed");
  const organisms = seen.get("organisms");
  const animals = seen.get("animals");
  if (typeof organisms !== "boolean") throw new Error("world save is missing its organisms list");
  if (typeof animals !== "boolean") throw new Error("world save is missing its animals list");
  const grid = seen.get("grid") as { tiles: number; inRange: boolean } | null | undefined;
  if (!grid) throw new Error("world save is missing its terrain grid");
  return {
    version: Number(version),
    tickText: tick.toString(),
    seedText: seed.toString(),
    organismsAreRecords: organisms,
    animalsAreRecords: animals,
    tiles: grid.tiles,
    tilesInRange: grid.inRange,
  };
}
