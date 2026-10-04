import { describe, expect, it } from 'vitest'
import { encode as msgpackEncode } from '@msgpack/msgpack'
import { gzipSync } from 'fflate'
import { binaryFramesReady, loadBinaryFrameDecoder, parseWorldFrame } from './wire'

const frame = {
  frame_id: 7,
  tick: 99,
  frame_kind: 'delta',
  organisms_complete: false,
  animals_complete: false,
  animals: [],
  weather: { kind: 'clear', intensity: 0 },
  grid: { width: 2, height: 2, origin_x: 0, origin_y: 0, fire: [], structure: [] },
}

function withEnvelope(tag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1)
  out[0] = tag
  out.set(body, 1)
  return out
}

describe('lazily loaded binary frame decoder', () => {
  it('reports a clear error for binary frames until the decoder is loaded, never for text frames', async () => {
    expect(binaryFramesReady()).toBe(false)
    const early = parseWorldFrame(msgpackEncode(frame))
    expect(early.isErr()).toBe(true)
    if (early.isErr()) expect(early.error).toMatchObject({ kind: 'json' })
    expect(parseWorldFrame(JSON.stringify(frame)).isOk()).toBe(true)

    await loadBinaryFrameDecoder()
    expect(binaryFramesReady()).toBe(true)
    await loadBinaryFrameDecoder()
  })

  it('decodes bare, plain-envelope and gzip-envelope MessagePack once loaded', async () => {
    await loadBinaryFrameDecoder()
    const packed = msgpackEncode(frame)
    const asBuffer = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength)
    for (const bytes of [packed, withEnvelope(0, packed), withEnvelope(1, gzipSync(packed)), asBuffer]) {
      const result = parseWorldFrame(bytes as Uint8Array | ArrayBuffer)
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.frame_id).toBe(7)
        expect(result.value.tick).toBe(99)
      }
    }
  })
})
