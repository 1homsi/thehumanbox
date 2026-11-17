import { readFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  packSave,
  SAVE_CONTAINER_VERSION,
  SAVE_HEADER_BYTES,
  SAVE_MAGIC,
  sameBytes,
  saveFormat,
  SaveFormatError,
  unpackSave,
} from './saveContainer'

const legacyWorld = new Uint8Array(
  gunzipSync(readFileSync(new URL('./fixtures/legacy-world-v7.save.gz', import.meta.url))),
)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('save container', () => {
  it('reads an old plain-text save exactly as it was written', async () => {
    expect(new TextDecoder().decode(legacyWorld.subarray(0, 12))).toBe('{"version":7')
    expect(saveFormat(legacyWorld)).toBe('legacy')
    expect(await unpackSave(legacyWorld)).toBe(legacyWorld)
  })

  it('packs a save into a smaller versioned container that unpacks to the same bytes', async () => {
    const packed = await packSave(legacyWorld)
    expect(saveFormat(packed)).toBe('container')
    expect([...packed.subarray(0, SAVE_HEADER_BYTES)]).toEqual([...SAVE_MAGIC, SAVE_CONTAINER_VERSION, 1])
    expect(packed.byteLength).toBeLessThan(legacyWorld.byteLength / 3)
    expect(sameBytes(await unpackSave(packed), legacyWorld)).toBe(true)
  })

  it('round-trips without the browser compression streams too', async () => {
    vi.stubGlobal('CompressionStream', undefined)
    vi.stubGlobal('DecompressionStream', undefined)
    const packed = await packSave(legacyWorld)
    expect(saveFormat(packed)).toBe('container')
    expect(sameBytes(await unpackSave(packed), legacyWorld)).toBe(true)
  })

  it('reads a container written with native streams when they are missing, and the other way round', async () => {
    const native = await packSave(legacyWorld)
    vi.stubGlobal('CompressionStream', undefined)
    vi.stubGlobal('DecompressionStream', undefined)
    const fallback = await packSave(legacyWorld)
    expect(sameBytes(await unpackSave(native), legacyWorld)).toBe(true)
    vi.unstubAllGlobals()
    expect(sameBytes(await unpackSave(fallback), legacyWorld)).toBe(true)
  })

  it('reads a save that was gzipped by hand', async () => {
    const gzipped = new Uint8Array(gzipSync(legacyWorld))
    expect(sameBytes(await unpackSave(gzipped), legacyWorld)).toBe(true)
  })

  it('reads an uncompressed container', async () => {
    const raw = Uint8Array.from([...SAVE_MAGIC, SAVE_CONTAINER_VERSION, 0, ...legacyWorld.subarray(0, 64)])
    expect(sameBytes(await unpackSave(raw), legacyWorld.subarray(0, 64))).toBe(true)
  })

  it('packs an empty payload', async () => {
    expect((await unpackSave(await packSave(new Uint8Array(0)))).byteLength).toBe(0)
  })

  it('refuses a container from a newer version, an unknown compression or a cut-off header', async () => {
    await expect(
      unpackSave(Uint8Array.from([...SAVE_MAGIC, SAVE_CONTAINER_VERSION + 1, 1, 0])),
    ).rejects.toThrow(SaveFormatError)
    await expect(unpackSave(Uint8Array.from([...SAVE_MAGIC, SAVE_CONTAINER_VERSION, 9]))).rejects.toThrow(
      'unknown compression',
    )
    await expect(unpackSave(Uint8Array.from([...SAVE_MAGIC, SAVE_CONTAINER_VERSION]))).rejects.toThrow(
      SaveFormatError,
    )
  })

  it('refuses a damaged compressed save instead of handing the simulation garbage', async () => {
    const packed = await packSave(legacyWorld)
    const damaged = packed.slice(0, Math.floor(packed.byteLength / 2))
    await expect(unpackSave(damaged)).rejects.toThrow(SaveFormatError)
  })

  it('stops packing when cancelled', async () => {
    const cancel = new AbortController()
    const packing = packSave(legacyWorld, { signal: cancel.signal })
    cancel.abort()
    await expect(packing).rejects.toThrow()
  })
})
