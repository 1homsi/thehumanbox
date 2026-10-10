import { describe, expect, it } from 'vitest'
import { EDGE_TOP, farmLookKey, type FarmLook } from './farm-tile'

const look: FarmLook = {
  stage: 'fallow',
  progress: 0,
  cropColor: '#d7b85a',
  crop: 'wheat',
  variant: 0,
  season: 'decline',
  edges: 0,
}

describe('farmLookKey', () => {
  it('gives equal looks one key and tells the season and the field edges apart', () => {
    expect(farmLookKey(look)).toBe(farmLookKey({ ...look }))
    expect(farmLookKey(look)).not.toBe(farmLookKey({ ...look, season: 'scarcity' }))
    expect(farmLookKey(look)).not.toBe(farmLookKey({ ...look, edges: EDGE_TOP }))
  })
})

describe('a ruined field', () => {
  const ripe: FarmLook = { ...look, stage: 'mature', progress: 1, season: 'decline', crop: 'wheat' }
  it('gets its own look, so a blighted field never bakes as a ripe one', () => {
    expect(farmLookKey({ ...ripe, withered: true })).not.toBe(farmLookKey(ripe))
    expect(farmLookKey({ ...ripe, withered: false })).toBe(farmLookKey(ripe))
  })
})
