/**
 * A one-instruction WASM SIMD module (`v128.const`). `WebAssembly.validate` accepts it only when the
 * engine can run SIMD. Browsers without it load the scalar sim instead of failing to instantiate.
 *
 * Bytes from the wasm-feature-detect SIMD probe.
 */
const SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03, 0x02, 0x01,
  0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
])

export function wasmSimdSupported(
  validate: (bytes: BufferSource) => boolean = (bytes) => WebAssembly.validate(bytes),
): boolean {
  try {
    return validate(SIMD_PROBE)
  } catch {
    return false
  }
}
