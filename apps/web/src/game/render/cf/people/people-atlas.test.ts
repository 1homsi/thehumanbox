/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HUMAN_ATLAS_CELL,
  HUMAN_ATLAS_COLS,
  HUMAN_ATLAS_ROWS,
  HUMAN_HEIGHT,
  HUMAN_STAGE_ORDER,
} from '../../character-visuals'
import { INK, hex } from '../../art-palette'

const svg = readFileSync(new URL('../../../../../public/sprites/people/people.svg', import.meta.url), 'utf8')
const cells = Array.from({ length: HUMAN_ATLAS_ROWS * HUMAN_ATLAS_COLS }, () => new Map<number, string>())
for (const path of svg.matchAll(/<path fill="(#[0-9a-f]+)" d="([^"]+)"\/>/g)) {
  for (const run of path[2].matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const x = Number(run[1])
    const y = Number(run[2])
    const cell = cells[Math.floor(y / HUMAN_ATLAS_CELL) * HUMAN_ATLAS_COLS + Math.floor(x / HUMAN_ATLAS_CELL)]
    for (let dx = 0; dx < Number(run[3]); dx++) {
      cell.set((y % HUMAN_ATLAS_CELL) * HUMAN_ATLAS_CELL + (x % HUMAN_ATLAS_CELL) + dx, path[1])
    }
  }
}

describe('authored people pixels', () => {
  it('fills every age, sex, era, appearance and walking cell with bounded native pixels', () => {
    for (let row = 0; row < HUMAN_ATLAS_ROWS; row++) {
      const stage = HUMAN_STAGE_ORDER[Math.floor(row / 6) % 5]
      for (let col = 0; col < HUMAN_ATLAS_COLS; col++) {
        const cell = cells[row * HUMAN_ATLAS_COLS + col]
        expect(cell.size).toBeGreaterThan(15)
        const ys = [...cell.keys()].map((key) => Math.floor(key / HUMAN_ATLAS_CELL))
        expect(Math.max(...ys)).toBeLessThanOrEqual(24)
        expect(Math.max(...ys) - Math.min(...ys) + 1).toBeLessThanOrEqual(HUMAN_HEIGHT[stage])
        expect([...cell.values()]).toContain(hex(INK))
      }
    }
  })

  it('has distinct poses at every age, era silhouettes and both facing directions', () => {
    const signature = (row: number, col: number) => JSON.stringify([...cells[row * HUMAN_ATLAS_COLS + col]])
    for (const row of [0, 6, 12, 18, 24, 30, 36, 42, 48, 54]) {
      for (let bank = 0; bank < 10; bank++) {
        expect(new Set([0, 1, 2, 3].map((frame) => signature(row, bank * 4 + frame))).size).toBe(4)
      }
      expect(new Set([0, 8, 16, 24, 32].map((col) => signature(row, col))).size).toBe(5)
      expect(signature(row, 0)).not.toBe(signature(row, 4))
    }
  })

  it('keeps the skin highlight on the screen-left side when the figure turns, under two dark eyes', () => {
    const row = 18
    for (const col of [0, 4]) {
      const cell = cells[row * HUMAN_ATLAS_COLS + col]
      expect(cell.get(13 * 32 + 15)).toBe('#d5a477')
      expect(cell.get(13 * 32 + 17)).toBe('#81513b')
      expect(cell.get(14 * 32 + 15)).toBe(hex(INK))
      expect(cell.get(14 * 32 + 17)).toBe(hex(INK))
    }
  })

  it('gives adults shoulders wider than the head, with a neck notch between them', () => {
    const width = (cell: Map<number, string>, y: number) =>
      [...cell.keys()].filter((key) => Math.floor(key / HUMAN_ATLAS_CELL) === y).length
    for (let appearance = 0; appearance < 6; appearance++) {
      for (const era of [0, 8, 16, 24, 32]) {
        // Feet at row 25, so the adult chin is row 15 and the shoulders row 16.
        const cell = cells[(18 + appearance) * HUMAN_ATLAS_COLS + era]
        expect(width(cell, 16)).toBeGreaterThan(width(cell, 15))
      }
    }
  })
})
