import { afterEach, describe, expect, it } from 'vitest'
import { claimCf, cfOwns, cfSplitCanvas } from './ownership'

afterEach(() => {
  // Claims are module state; release anything a test left.
  for (const n of ['buildings', 'vegetation', 'landuse']) claimCf([n])()
})

describe('cf ownership', () => {
  it('is owned only while claimed, and releases on cleanup', () => {
    expect(cfOwns('buildings')).toBe(false)
    const release = claimCf(['buildings', 'vegetation'])
    expect(cfOwns('buildings')).toBe(true)
    expect(cfOwns('vegetation')).toBe(true)
    expect(cfOwns('landuse')).toBe(false)
    release()
    expect(cfOwns('buildings')).toBe(false)
  })

  it('splits the canvas only when a flag asks for layers above the terrain', () => {
    // No window in the node environment: no flags are on.
    expect(cfSplitCanvas()).toBe(false)
  })
})
