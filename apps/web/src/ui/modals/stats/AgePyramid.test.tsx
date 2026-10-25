// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OrganismState } from '../../../shared/types'
import { AgePyramid } from './AgePyramid'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

function man(age: number, maxAge: number): OrganismState {
  return { id: `${age}`, sex: 'male', alive: true, age, max_age: maxAge } as unknown as OrganismState
}

/** The men in each row, top to bottom: elders, adults, then children. */
function menByRow(organisms: OrganismState[]): string[] {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<AgePyramid organisms={organisms} />))
  return [...host.querySelectorAll('.age-row')].map(
    (row) => row.querySelector('.age-bar-m')?.textContent ?? '',
  )
}

// A lifespan of 12000 ticks: the simulation calls a person a child or teen under 35% of it, an adult
// to 75%, and an elder from 75% on.
describe('AgePyramid', () => {
  it('counts a person a third of the way through life as a child, not an elder', () => {
    expect(menByRow([man(4000, 12000)])).toEqual(['', '', '1'])
  })

  it('counts a person halfway through life as an adult', () => {
    expect(menByRow([man(6000, 12000)])).toEqual(['', '1', ''])
  })

  it('counts a person three quarters of the way through life as an elder', () => {
    expect(menByRow([man(9000, 12000)])).toEqual(['1', '', ''])
  })
})
