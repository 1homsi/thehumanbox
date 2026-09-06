import { describe, expect, it } from 'vitest'
import { Euler, Matrix4 } from 'three'
import { buildPartsByKind } from './animal-model'

describe('native 3D animal models', () => {
  it('builds finite, bounded geometry for all seven species', () => {
    for (const kind of ['rabbit', 'deer', 'boar', 'bird', 'fish', 'wolf', 'dog'] as const) {
      const parts = buildPartsByKind(kind)
      expect(parts.length).toBeGreaterThan(3)
      for (const part of parts) {
        const geometry = part.geom()
        const positions = geometry.getAttribute('position')
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
        geometry.computeBoundingSphere()
        expect(geometry.boundingSphere!.radius).toBeLessThan(2)
        geometry.dispose()
      }
    }
  })

  it('orients quadruped bodies along their forward axis', () => {
    for (const kind of ['deer', 'boar', 'wolf', 'dog'] as const) {
      const body = buildPartsByKind(kind)[0]
      const geometry = body.geom()
      geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...body.rot)))
      geometry.computeBoundingBox()
      const box = geometry.boundingBox!
      expect(box.max.z - box.min.z).toBeGreaterThan(box.max.y - box.min.y)
      geometry.dispose()
    }
  })

  it('gives dogs their own coat and collar', () => {
    const dog = buildPartsByKind('dog')
    const wolf = buildPartsByKind('wolf')
    expect(dog[0].color).not.toBe(wolf[0].color)
    expect(dog.some((part) => part.color === '#b34f42')).toBe(true)
    expect(wolf.some((part) => part.color === '#b34f42')).toBe(false)
  })
})
