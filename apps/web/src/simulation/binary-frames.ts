import { decode as msgpackDecode } from '@msgpack/msgpack'
import { gunzipSync } from 'fflate'

/**
 * Decodes a binary world frame from the native server: an optional one-byte
 * envelope (0 = plain, 1 = gzip) followed by MessagePack. Kept in its own module
 * so the codecs are only downloaded by sessions that actually receive binary
 * frames (the desktop app and the local server); the in-browser WebAssembly
 * simulation posts JSON text and never loads them.
 */
export function decodeBinaryFrame(raw: ArrayBuffer | Uint8Array): unknown {
  let bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  if (bytes.length > 0 && bytes[0] === 0) {
    bytes = bytes.subarray(1)
  } else if (bytes.length > 0 && bytes[0] === 1) {
    bytes = gunzipSync(bytes.subarray(1))
  }
  return msgpackDecode(bytes)
}
