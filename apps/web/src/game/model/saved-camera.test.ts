// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetSavedCameraForReload, flushSavedCamera, readSavedCamera, saveCamera } from './saved-camera'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

const WORLD = { w: 640, h: 400 }

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  window.localStorage.setItem('thb-wasm-seed', '7')
})

describe('the saved camera', () => {
  it('is read back for the same world, and not for another seed or size', () => {
    saveCamera({ x: 100, y: 50, zoom: 3 }, WORLD)
    flushSavedCamera()
    expect(readSavedCamera(WORLD)).toEqual({ x: 100, y: 50, zoom: 3 })
    expect(readSavedCamera({ w: 320, h: 400 })).toBeNull()
    window.localStorage.setItem('thb-wasm-seed', '8')
    expect(readSavedCamera(WORLD)).toBeNull()
  })

  it('is forgotten for a reload, written by nothing until then, and given back if the reload fails', () => {
    saveCamera({ x: 100, y: 50, zoom: 3 }, WORLD)
    flushSavedCamera()
    const camera = forgetSavedCameraForReload()
    expect(readSavedCamera(WORLD)).toBeNull()
    saveCamera({ x: 200, y: 80, zoom: 2 }, WORLD)
    flushSavedCamera()
    expect(readSavedCamera(WORLD)).toBeNull()
    camera.resume()
    expect(readSavedCamera(WORLD)).toEqual({ x: 100, y: 50, zoom: 3 })
  })
})
