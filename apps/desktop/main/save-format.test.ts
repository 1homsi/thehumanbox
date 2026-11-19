import assert from "node:assert/strict";
import test from "node:test";
import * as zlib from "node:zlib";

import { storedSaveFormat, unpackWorldSave } from "./world-safety/save-format";
import { validateWorldSaveBytes } from "./world-safety/save-validation";

function str(text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  return Buffer.concat([Buffer.from([0xa0 | body.length]), body]);
}

function u64(value: bigint): Buffer {
  const out = Buffer.alloc(9);
  out[0] = 0xcf;
  out.writeBigUInt64BE(value, 1);
  return out;
}

function map(entries: [string, Buffer][]): Buffer {
  return Buffer.concat([Buffer.from([0x80 | entries.length]), ...entries.flatMap(([k, v]) => [str(k), v])]);
}

function tiles(count: number, tile: number): Buffer {
  const head = Buffer.alloc(5);
  head[0] = 0xdd;
  head.writeUInt32BE(count, 1);
  return Buffer.concat([head, Buffer.alloc(count, tile)]);
}

function compactSave(options: { seed?: bigint; tileCount?: number; version?: number } = {}): Buffer {
  const record = map([
    ["version", Buffer.from([options.version ?? 7])],
    ["tick_count", Buffer.from([0xcd, 0x01, 0x2c])],
    ["world_seed", u64(options.seed ?? 13140519938601842915n)],
    ["organisms", Buffer.concat([Buffer.from([0x91]), map([["id", str("a")]])])],
    ["animals", Buffer.from([0x90])],
    ["grid", map([["tiles", tiles(options.tileCount ?? 800 * 400, 1)]])],
  ]);
  return Buffer.concat([Buffer.from("THBSAVE\x02", "latin1"), Buffer.from([0x92, 0x90]), record]);
}

function container(payload: Buffer, codec = 1): Buffer {
  const body = codec === 1 ? zlib.gzipSync(payload) : payload;
  return Buffer.concat([Buffer.from([0x89, 0x54, 0x48, 0x42, 1, codec]), body]);
}

function jsonSave(): Buffer {
  return Buffer.from(
    JSON.stringify({
      version: 7,
      tick_count: 300,
      world_seed: 77,
      organisms: [],
      animals: [],
      grid: { tiles: new Array(800 * 400).fill(1) },
    }),
  );
}

test("the container, a bare gzip stream and a plain save all unpack to the same payload", () => {
  const payload = compactSave();
  assert.equal(storedSaveFormat(container(payload)), "container");
  assert.equal(storedSaveFormat(zlib.gzipSync(payload)), "gzip");
  assert.equal(storedSaveFormat(payload), "plain");
  assert.deepEqual(Buffer.from(unpackWorldSave(container(payload))), payload);
  assert.deepEqual(Buffer.from(unpackWorldSave(container(payload, 0))), payload);
  assert.deepEqual(Buffer.from(unpackWorldSave(zlib.gzipSync(payload))), payload);
  assert.equal(unpackWorldSave(payload), payload);
});

test("a container from a newer app, with an unknown codec or cut short is refused", () => {
  assert.throws(() => unpackWorldSave(Buffer.from([0x89, 0x54, 0x48, 0x42, 2, 1])), /newer/);
  assert.throws(() => unpackWorldSave(Buffer.from([0x89, 0x54, 0x48, 0x42, 1, 7])), /codec/);
  assert.throws(() => unpackWorldSave(Buffer.from([0x89, 0x54, 0x48, 0x42])), /cut short/);
  assert.throws(() => unpackWorldSave(container(compactSave()).subarray(0, 20)), /decompressed/);
});

test("compact saves validate inside and outside the container, keeping the stored bytes", () => {
  for (const stored of [compactSave(), container(compactSave()), zlib.gzipSync(compactSave())]) {
    const save = validateWorldSaveBytes(stored);
    assert.equal(save.version, 7);
    assert.equal(save.tickText, "300");
    assert.equal(save.seedText, "13140519938601842915");
    assert.deepEqual(save.bytes, stored);
  }
});

test("plain JSON saves still validate, also inside the container", () => {
  for (const stored of [jsonSave(), container(jsonSave())]) {
    const save = validateWorldSaveBytes(stored);
    assert.equal(save.seedText, "77");
    assert.equal(save.tickText, "300");
  }
});

test("a compact save with the wrong map size or from a newer schema is refused", () => {
  assert.throws(() => validateWorldSaveBytes(compactSave({ tileCount: 10 })), /10 tiles/);
  assert.throws(() => validateWorldSaveBytes(container(compactSave({ version: 9 }))), /newer/);
  assert.throws(() => validateWorldSaveBytes(compactSave().subarray(0, 40)), /ends in the middle/);
});
