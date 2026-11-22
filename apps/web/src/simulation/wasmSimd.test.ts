import { describe, expect, it } from 'vitest'
import { wasmSimdSupported } from './wasmSimd'

describe('wasmSimdSupported', () => {
  it('accepts the probe on an engine with WASM SIMD', () => {
    expect(wasmSimdSupported()).toBe(true)
  })

  it('falls back when validation throws or rejects the probe', () => {
    expect(wasmSimdSupported(() => false)).toBe(false)
    expect(
      wasmSimdSupported(() => {
        throw new Error('no wasm')
      }),
    ).toBe(false)
  })
})
