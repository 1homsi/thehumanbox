import { describe, expect, it } from 'vitest'
import { hasKin, kinLinks, type KinPerson } from './kin-links'

const person = (id: string, extra: Partial<KinPerson> = {}): KinPerson => ({
  id,
  name: id.toUpperCase(),
  alive: true,
  parent_id: null,
  father_id: null,
  partner_id: null,
  ...extra,
})

describe('kinLinks', () => {
  const mum = person('mum')
  const dad = person('dad')
  const kid = person('kid', { parent_id: 'mum', father_id: 'dad' })
  const kid2 = person('kid2', { parent_id: 'mum', father_id: 'dad' })
  const self = person('self', { parent_id: 'mum', father_id: 'dad', partner_id: 'pal' })
  const pal = person('pal', { custom_name: 'Pally' })
  const enemy = person('enemy')
  const everyone = [mum, dad, kid, kid2, self, pal, enemy]

  it('links the partner, both parents and the children, by id', () => {
    const k = kinLinks(self, everyone)
    expect(k.partner).toEqual({ id: 'pal', name: 'Pally', alive: true })
    expect(k.mother).toEqual({ id: 'mum', name: 'MUM', alive: true })
    expect(k.father).toEqual({ id: 'dad', name: 'DAD', alive: true })
    expect(k.children.map((c) => c.id)).toEqual([])
    expect(kinLinks(mum, everyone).children.map((c) => c.id)).toEqual(['kid', 'kid2', 'self'])
  })

  it('keeps friends the person names even when they are not in the list', () => {
    const k = kinLinks({ ...self, friends: { gone: 'Gone One', pal: 'Pally' } }, everyone)
    expect(k.friends).toEqual([
      { id: 'gone', name: 'Gone One', alive: false },
      { id: 'pal', name: 'Pally', alive: true },
    ])
  })

  it('lists only the strongly distrusted as rivals, worst first', () => {
    const k = kinLinks({ ...self, org_trust: { enemy: -0.8, dad: -0.3, mum: 0.6, pal: -0.1 } }, everyone)
    expect(k.rivals.map((r) => r.id)).toEqual(['enemy', 'dad'])
  })

  it('has nothing to show for a loner', () => {
    const loner = person('loner')
    expect(hasKin(kinLinks(loner, [loner]))).toBe(false)
  })
})
