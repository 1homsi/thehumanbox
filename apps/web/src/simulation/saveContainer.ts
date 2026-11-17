import { Gzip, gunzipSync } from 'fflate'

export const SAVE_MAGIC = [0x89, 0x54, 0x48, 0x42] as const
export const SAVE_CONTAINER_VERSION = 1
export const SAVE_HEADER_BYTES = 6

export const SaveCodec = { Raw: 0, Gzip: 1 } as const
type SaveCodecId = (typeof SaveCodec)[keyof typeof SaveCodec]

export type SaveFormat = 'container' | 'legacy'

const GZIP_MAGIC = [0x1f, 0x8b] as const
const CHUNK_BYTES = 1 << 20

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaveFormatError'
  }
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.byteLength < prefix.length) return false
  return prefix.every((byte, i) => bytes[i] === byte)
}

export function saveFormat(bytes: Uint8Array): SaveFormat {
  return startsWith(bytes, SAVE_MAGIC) ? 'container' : 'legacy'
}

const yieldToLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

export interface PackOptions {
  signal?: AbortSignal
}

function abortError(): Error {
  return new DOMException('save compression was cancelled', 'AbortError')
}

function chunkedSource(
  bytes: Uint8Array,
  options: { signal?: AbortSignal; yieldBetweenChunks: boolean },
): ReadableStream<BufferSource> {
  let at = 0
  return new ReadableStream<BufferSource>({
    async pull(controller) {
      if (options.yieldBetweenChunks && at > 0) await yieldToLoop()
      if (options.signal?.aborted) {
        controller.error(abortError())
        return
      }
      if (at >= bytes.byteLength) {
        controller.close()
        return
      }
      const end = Math.min(bytes.byteLength, at + CHUNK_BYTES)
      controller.enqueue(bytes.subarray(at, end) as Uint8Array<ArrayBuffer>)
      at = end
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>, prefix?: Uint8Array): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = prefix ? [prefix] : []
  let total = prefix?.byteLength ?? 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  return concat(chunks, total)
}

function nativeStreams(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'
}

async function gzipWithFflate(
  payload: Uint8Array,
  header: Uint8Array,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [header]
  let total = header.byteLength
  const gzip = new Gzip({ level: 6 }, (chunk) => {
    chunks.push(chunk)
    total += chunk.byteLength
  })
  for (let at = 0; at < payload.byteLength || at === 0; at += CHUNK_BYTES) {
    const end = Math.min(payload.byteLength, at + CHUNK_BYTES)
    if (signal?.aborted) throw abortError()
    gzip.push(payload.subarray(at, end), end >= payload.byteLength)
    if (end < payload.byteLength) await yieldToLoop()
  }
  return concat(chunks, total)
}

function header(codec: SaveCodecId): Uint8Array {
  return Uint8Array.from([...SAVE_MAGIC, SAVE_CONTAINER_VERSION, codec])
}

export async function packSave(payload: Uint8Array, options: PackOptions = {}): Promise<Uint8Array> {
  const head = header(SaveCodec.Gzip)
  if (!nativeStreams()) return gzipWithFflate(payload, head, options.signal)
  const source = chunkedSource(payload, { signal: options.signal, yieldBetweenChunks: true })
  return collect(source.pipeThrough(new CompressionStream('gzip')), head)
}

async function gunzip(compressed: Uint8Array): Promise<Uint8Array> {
  try {
    if (!nativeStreams()) return gunzipSync(compressed)
    const source = chunkedSource(compressed, { yieldBetweenChunks: false })
    return await collect(source.pipeThrough(new DecompressionStream('gzip')))
  } catch (error) {
    throw new SaveFormatError(
      `save could not be decompressed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function unpackSave(bytes: Uint8Array): Promise<Uint8Array> {
  if (saveFormat(bytes) === 'legacy') {
    return startsWith(bytes, GZIP_MAGIC) ? gunzip(bytes) : bytes
  }
  if (bytes.byteLength < SAVE_HEADER_BYTES) throw new SaveFormatError('save header is cut short')
  const version = bytes[SAVE_MAGIC.length]
  if (version > SAVE_CONTAINER_VERSION) {
    throw new SaveFormatError(`save was written by a newer version of the game (format ${version})`)
  }
  const codec = bytes[SAVE_MAGIC.length + 1]
  const body = bytes.subarray(SAVE_HEADER_BYTES)
  if (codec === SaveCodec.Raw) return body
  if (codec === SaveCodec.Gzip) return gunzip(body)
  throw new SaveFormatError(`save uses an unknown compression (${codec})`)
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false
  return true
}
