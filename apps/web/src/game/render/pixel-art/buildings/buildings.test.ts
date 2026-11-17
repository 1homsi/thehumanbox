import { describe, expect, it } from 'vitest'
import type { Art } from '../art.ts'
import { INK } from '../palette.ts'
import { FOOTPRINTS } from '../../building-draw/footprint-table.ts'
import { DRAWN, FLAT, drawBuildingArt } from './index.ts'
import type { Look } from './index.ts'
import { HOME_KIND_TIER } from './homes.ts'
import { SIGNS } from './trades.ts'
import { snowOn, wornOn } from './wear.ts'

const look = (kind: string, over: Partial<Look> = {}): Look => {
  const [fw, fh] = FOOTPRINTS[kind] ?? [1, 1]
  return { kind, fw, fh, variant: 0, night: 0, tier: 4, state: '', land: '', ...over }
}
const draw = (kind: string, over: Partial<Look> = {}): Art => drawBuildingArt(look(kind, over))!
const sig = (a: Art) => `${a.w}x${a.h}:${a.px.join(',')}`
const HOMES = Object.keys(HOME_KIND_TIER).filter((k) => k !== 'Tent')
/** Kinds whose edge is the ground's own tone, not ink (see finishGround), and walls that join end to end. */
const SOFT_EDGED = new Set([...FLAT, 'Wall'])

describe('the drawn buildings', () => {
  it('draw every kind of the footprint table', () => {
    expect(Object.keys(FOOTPRINTS).filter((k) => !(k in DRAWN))).toEqual([])
  })

  it('fit the cell the map bakes them into, in every variant, era and light', () => {
    const misfits: string[] = []
    for (const kind of Object.keys(DRAWN)) {
      const [fw, fh] = FOOTPRINTS[kind] ?? [1, 1]
      const tiers = kind in HOME_KIND_TIER ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [4]
      for (const tier of tiers)
        for (let variant = 0; variant < 8; variant++)
          for (const night of [0, 2]) {
            const a = draw(kind, { tier, variant, night })
            if (a.w > fw * 8 + 16 || a.h > fh * 8 + 26)
              misfits.push(`${kind} t${tier} v${variant}: ${a.w}x${a.h}`)
            if (!a.px.some((c) => c !== 0)) misfits.push(`${kind} t${tier} v${variant}: empty`)
          }
    }
    expect(misfits).toEqual([])
  })

  it('are the same every time', () => {
    for (const kind of Object.keys(DRAWN))
      expect(sig(draw(kind, { variant: 3 }))).toBe(sig(draw(kind, { variant: 3 })))
  })

  it('have an ink outline all the way round, so nothing bleeds into the ground', () => {
    const open: string[] = []
    for (const kind of Object.keys(DRAWN)) {
      if (SOFT_EDGED.has(kind)) continue
      const a = draw(kind)
      for (let y = 0; y < a.h; y++)
        for (let x = 0; x < a.w; x++) {
          const c = a.get(x, y)
          if (!c || c === INK) continue
          const onEdge = x === 0 || y === 0 || x === a.w - 1 || y === a.h - 1
          const besideEmpty = !a.get(x - 1, y) || !a.get(x + 1, y) || !a.get(x, y - 1) || !a.get(x, y + 1)
          if (onEdge || besideEmpty) open.push(`${kind} at ${x},${y}`)
        }
    }
    expect(open.slice(0, 5)).toEqual([])
  })

  it('give every kind a drawing of its own: no two kinds share a sprite', () => {
    const seen = new Map<string, string>()
    const twins: string[] = []
    for (const kind of Object.keys(DRAWN)) {
      const s = sig(draw(kind))
      const other = seen.get(s)
      if (other) twins.push(`${kind} = ${other}`)
      seen.set(s, kind)
    }
    expect(twins).toEqual([])
  })

  it('light their windows at night', () => {
    for (const kind of ['House', 'TownHouse', 'Manor', 'Hospital', 'Library', 'Lighthouse', 'Factory'])
      expect(sig(draw(kind, { night: 2 }))).not.toBe(sig(draw(kind)))
  })
})

describe('homes', () => {
  it('change with every era, from the first era the kind exists in', () => {
    for (const kind of HOMES) {
      const looks = new Set<string>()
      const first = HOME_KIND_TIER[kind]
      for (let tier = first; tier <= 8; tier++) looks.add(sig(draw(kind, { tier })))
      expect(looks.size).toBe(9 - first)
    }
  })

  it('never look older than the kind is', () => {
    expect(sig(draw('Apartment', { tier: 0 }))).toBe(sig(draw('Apartment', { tier: 6 })))
    expect(sig(draw('Manor', { tier: 1 }))).toBe(sig(draw('Manor', { tier: 3 })))
  })

  it('come in at least three forms in each era', () => {
    for (let tier = 1; tier <= 8; tier++) {
      const forms = new Set([0, 1, 2, 3, 4, 5].map((variant) => sig(draw('House', { tier, variant }))))
      expect(forms.size).toBeGreaterThanOrEqual(3)
    }
  })

  it('carry their tribe’s roof colour', () => {
    const roofs = (['tile', 'slate', 'moss', 'straw'] as const).map((roof) =>
      sig(draw('House', { tier: 3, roof })),
    )
    expect(new Set(roofs).size).toBe(4)
  })

  it('follow the land in the first ages: six ways of building', () => {
    const lands = ['snow', 'adobe', 'stilt', 'longhouse', 'round', 'turf']
    for (const fp of [1, 2, 3]) {
      const looks = lands.map((land) => sig(draw('Hut', { tier: 0, land, fw: fp, fh: fp })))
      expect(new Set(looks).size).toBe(6)
    }
  })

  it('stay small on a small plot, even in the space age', () => {
    for (let variant = 0; variant < 8; variant++)
      expect(draw('Hut', { tier: 7, variant }).h).toBeLessThanOrEqual(26)
    expect(draw('Skyscraper', { tier: 7 }).h).toBeGreaterThan(40)
  })
})

describe('trades and passing states', () => {
  it('give every shop its own sign', () => {
    const signs = Object.values(SIGNS).map((s) => s.join('|'))
    expect(new Set(signs).size).toBe(signs.length)
  })

  it('show a hull growing on the shipyard’s slip', () => {
    const stages = ['', 'hull1', 'hull2', 'hull3'].map((state) => sig(draw('Shipyard', { state })))
    expect(new Set(stages).size).toBe(4)
  })

  it('empty the launch pad while the rocket is away', () => {
    expect(sig(draw('Spaceport', { state: 'empty' }))).not.toBe(sig(draw('Spaceport')))
  })
})

describe('wear and weather', () => {
  it('lays snow on the top of a roof without changing the silhouette', () => {
    const plain = draw('House', { tier: 3 })
    const snowy = snowOn(plain)
    expect(sig(snowy)).not.toBe(sig(plain))
    for (let i = 0; i < plain.px.length; i++) expect(snowy.px[i] === 0).toBe(plain.px[i] === 0)
  })

  it('cracks a worn building inside its outline, differently by variant', () => {
    const plain = draw('House', { tier: 3 })
    const worn = wornOn(plain, 1)
    expect(sig(worn)).not.toBe(sig(plain))
    expect(sig(wornOn(plain, 2))).not.toBe(sig(worn))
    for (let i = 0; i < plain.px.length; i++) {
      expect(worn.px[i] === 0).toBe(plain.px[i] === 0)
      if (plain.px[i] === INK) expect(worn.px[i]).toBe(INK)
    }
  })
})
