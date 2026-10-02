import { describe, expect, it } from 'vitest'
import { roadStyle } from './roads'

describe('roads', () => {
  it('are built to the age of the tribes they join', () => {
    expect(roadStyle(0).kind).toBe('track')
    expect(roadStyle(1).kind).toBe('track')
    expect(roadStyle(2).kind).toBe('cobble')
    expect(roadStyle(4).kind).toBe('cobble')
    expect(roadStyle(5).kind).toBe('asphalt')
    expect(roadStyle(7).kind).toBe('asphalt')
  })

  it('widen as they are improved', () => {
    expect(roadStyle(5).width).toBeGreaterThan(roadStyle(2).width)
    expect(roadStyle(2).width).toBeGreaterThan(roadStyle(0).width)
  })
})
