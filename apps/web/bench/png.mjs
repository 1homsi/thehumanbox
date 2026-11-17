// A minimal PNG writer (8-bit RGBA, no dependencies) for the art sheets.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}

/** Writes `rgba` (a Uint8Array of w * h * 4 bytes) to `path` as a PNG. */
export function writePng(path, w, h, rgba) {
  const stride = w * 4 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * stride + 1)
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head[8] = 8
  head[9] = 6
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', head),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
