import { SPRITE_HIDDEN, SPRITE_UNTEXTURED, type LayerAtlas, type SpriteLayer } from 'xipjs'
import { TILE } from '../../../model/palette'
import { CELL_GUTTER } from '../atlas/cell-atlas'
import { PAD_BOT } from '../../building-painters/kit'

export interface OccluderSource {
  readonly layer: SpriteLayer
  readonly atlases: LayerAtlas[]
  readonly slot: number
  readonly slots: number
  groundLine(layer: SpriteLayer, i: number): number
}

export const OCCLUDER_SLOTS = {
  trees: { slot: 2, slots: 3 },
  props: { slot: 5, slots: 3 },
  buildings: { slot: 8, slots: 8 },
} as const

export const WALKER_ATLAS_SLOTS = 16

const sources = new Map<string, OccluderSource>()
let epoch = 0
let close = false

export function setOccludersClose(on: boolean): void {
  if (close === on) return
  close = on
  epoch++
}

export function occludersClose(): boolean {
  return close
}

export function buildingGroundLine(layer: SpriteLayer, i: number): number {
  return layer.y[i] + layer.h[i] / 2 - CELL_GUTTER - PAD_BOT - TILE / 2 - 1
}

export function treeGroundLine(layer: SpriteLayer, i: number): number {
  const key = layer.sortKey[i]
  if (key < 0) return NaN
  return key >= 1e5 ? key - 1e5 : key
}

export function registerOccluders(name: string, source: OccluderSource): () => void {
  sources.set(name, source)
  epoch++
  return () => {
    if (sources.get(name) === source) {
      sources.delete(name)
      epoch++
    }
  }
}

export function walkerAtlases(own: LayerAtlas[]): LayerAtlas[] {
  const list = own.slice()
  while (list.length < WALKER_ATLAS_SLOTS) list.push(own[0])
  return list
}

export class OccluderMirror {
  private stamp = ''
  private readonly layer: SpriteLayer
  private readonly own: LayerAtlas
  private readonly keyOf: (groundPx: number, oy: number) => number

  constructor(layer: SpriteLayer, keyOf?: (groundPx: number, oy: number) => number) {
    this.layer = layer
    this.own = layer.atlases[0]
    this.keyOf = keyOf ?? ((px, oy) => (px - TILE / 2) / TILE + oy)
  }

  private stale(base: number, on: boolean): string | null {
    let stamp = `${epoch}|${base}|${on ? 1 : 0}`
    if (on) for (const [name, s] of sources) stamp += `|${name}:${s.layer.version}:${s.layer.count}`
    return stamp === this.stamp ? null : stamp
  }

  sync(base: number, oy: number, on: boolean, force = false): boolean {
    const stamp = this.stale(base, on)
    if (stamp === null && !force) return false
    const layer = this.layer
    let total = 0
    if (on) for (const s of sources.values()) total += s.layer.count
    layer.resize(base + total)
    let n = base
    if (on) {
      for (const s of sources.values()) {
        for (let k = 0; k < s.slots; k++) layer.atlases[s.slot + k] = s.atlases[k] ?? this.own
        const src = s.layer
        for (let i = 0; i < src.count; i++) {
          const flags = src.flags[i]
          if (flags & (SPRITE_HIDDEN | SPRITE_UNTEXTURED)) continue
          const page = src.atlas[i]
          if (page >= s.slots) continue
          const ground = s.groundLine(src, i)
          if (ground !== ground) continue
          layer.x[n] = src.x[i]
          layer.y[n] = src.y[i]
          layer.w[n] = src.w[i]
          layer.h[n] = src.h[i]
          layer.rotation[n] = 0
          layer.atlas[n] = s.slot + page
          layer.frame[n] = src.frame[i]
          layer.color[n] = src.color[i]
          layer.flags[n] = flags
          layer.sortKey[n] = this.keyOf(ground, oy)
          layer.ids[n] = -1
          n++
        }
      }
    }
    layer.resize(n)
    if (n > base) layer.touchRange(base, n - 1)
    else layer.touch()
    this.stamp = this.stale(base, on) ?? this.stamp
    return true
  }
}
