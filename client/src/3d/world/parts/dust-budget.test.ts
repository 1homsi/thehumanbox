import { expect, it } from 'vitest'
import { visitDustCandidates, pruneDustEmitters, DUST_EMISSION_BUDGET, DUST_SCAN_BUDGET } from './dust-budget'
it('bounds dense emissions and advances fairly to later residents', () => {
  const seen: number[] = []
  const cursor = visitDustCandidates(50000, 0, (i) => {
    seen.push(i)
    return true
  })
  expect(seen).toHaveLength(DUST_EMISSION_BUDGET)
  const next: number[] = []
  visitDustCandidates(50000, cursor, (i) => {
    next.push(i)
    return true
  })
  expect(next[0]).toBe(DUST_EMISSION_BUDGET)
})
it('bounds scans even when all residents are outside the camera range', () => {
  let checks = 0
  expect(
    visitDustCandidates(50000, 49999, () => {
      checks++
      return false
    }),
  ).toBe(DUST_SCAN_BUDGET - 1)
  expect(checks).toBe(DUST_SCAN_BUDGET)
  expect(
    visitDustCandidates(0, 20, () => {
      throw Error('must not run')
    }),
  ).toBe(0)
})
it('drops historical emitters but preserves living positions', () => {
  const map = new Map<string, [number, number]>([
    ['dead', [1, 2]],
    ['alive', [3, 4]],
  ])
  pruneDustEmitters(map, new Set(['alive']))
  expect([...map]).toEqual([['alive', [3, 4]]])
})
