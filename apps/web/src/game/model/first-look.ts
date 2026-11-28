/**
 * Where a fresh world should open, read off the world the sim already sent.
 * The reaches are the sim's own: strangers within 12 tiles are meeting
 * (organism_tick intruders), kin within 8 with four others are a band that can
 * split (wander), and a camp is settlement tier 1. Nothing here is written back.
 * Null when no group qualifies, so the caller keeps the usual first look.
 */

const MEET_REACH = 12
const SPLIT_REACH = 8
/** The person and four kin: the wander fork's crowd. */
const SPLIT_BAND = 5
/** People a split must leave behind. */
const SPLIT_LEFT = 2
const CLUSTER_MIN = 3
/** Town-cluster cell, in tiles (civ_tick/town CLUSTER_CELL). */
const CLUSTER_CELL = 12
const CAMP_TIER = 1

interface Person {
  x: number
  y: number
  lineage: string
}

export interface FirstLookAt {
  x: number
  y: number
}

/** Where to look, and the tribe there that is about to act. */
export interface FirstLookTarget extends FirstLookAt {
  tribe: string
}

export interface FirstLookWorld {
  organisms: readonly { alive?: boolean; x: number; y: number; lineage_id: string }[]
  settlements?: readonly { lineage_id: string; tier?: number; center?: [number, number] | null }[] | null
  battles?:
    | readonly {
        location?: [number, number] | null
        ended?: boolean
        started_tick?: number
        attackers?: readonly string[] | null
        defenders?: readonly string[] | null
      }[]
    | null
  buildings?:
    | readonly {
        x: number
        y: number
        condition?: number
        construction_progress?: number
        decorative?: boolean
        ruined?: boolean
        owner_lineage?: string | null
        lineage_id?: string | null
      }[]
    | null
  tribal_relations?: readonly { a: string; b: string; status?: string }[] | null
}

export function firstLookFocus(world: FirstLookWorld): FirstLookAt | null {
  const target = firstLookTarget(world)
  return target && { x: target.x, y: target.y }
}

/** The group about to do something visible, with the tribe it belongs to. Null when none qualifies. */
export function firstLookTarget(world: FirstLookWorld): FirstLookTarget | null {
  const people = living(world)
  if (people.length === 0) return null
  return (
    fight(world, people) ??
    meeting(people, world) ??
    raising(world) ??
    split(people) ??
    cluster(people, world)
  )
}

/**
 * Where a new world's camera opens: the group about to act (see firstLookTarget), or else the most
 * populous tribe at its home. Ties go to the lower lineage id, so the same world always opens on the
 * same tribe. Null when nobody is alive.
 */
export function openingTarget(world: FirstLookWorld): FirstLookTarget | null {
  const acting = firstLookTarget(world)
  if (acting) return acting
  const people = living(world)
  const tribe = largestOf(tribeSizes(people))
  if (tribe === null) return null
  const camp = world.settlements?.find((s) => s.lineage_id === tribe && s.center)
  if (camp?.center && Number.isFinite(camp.center[0]) && Number.isFinite(camp.center[1])) {
    return { ...point(camp.center[0], camp.center[1]), tribe }
  }
  let sx = 0
  let sy = 0
  let n = 0
  for (const p of people) {
    if (p.lineage !== tribe) continue
    sx += p.x
    sy += p.y
    n += 1
  }
  return { ...point(sx / n, sy / n), tribe }
}

function tribeSizes(people: readonly Person[]): Map<string, number> {
  const sizes = new Map<string, number>()
  for (const p of people) sizes.set(p.lineage, (sizes.get(p.lineage) ?? 0) + 1)
  return sizes
}

/** The tribe with the most people; the lower id on a tie. */
function largestOf(sizes: ReadonlyMap<string, number>, among?: readonly string[]): string | null {
  let best: string | null = null
  let most = 0
  for (const id of among ?? sizes.keys()) {
    const n = sizes.get(id) ?? 0
    if (n === 0) continue
    if (n > most || (n === most && best !== null && id < best)) {
      best = id
      most = n
    }
  }
  return best
}

function living(world: FirstLookWorld): Person[] {
  const people: Person[] = []
  for (const o of world.organisms) {
    if (o.alive === false || !o.lineage_id) continue
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue
    people.push({ x: o.x, y: o.y, lineage: o.lineage_id })
  }
  return people
}

function point(x: number, y: number): FirstLookAt {
  return { x: Math.round(x), y: Math.round(y) }
}

function buckets(people: readonly Person[], cell: number): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (let i = 0; i < people.length; i++) {
    const key = `${Math.floor(people[i].x / cell)},${Math.floor(people[i].y / cell)}`
    const list = out.get(key)
    if (list) list.push(i)
    else out.set(key, [i])
  }
  return out
}

function nearby(index: Map<string, number[]>, cell: number, x: number, y: number): number[] {
  const cx = Math.floor(x / cell)
  const cy = Math.floor(y / cell)
  const found: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = index.get(`${cx + dx},${cy + dy}`)
      if (list) found.push(...list)
    }
  }
  return found
}

function settled(world: FirstLookWorld): Set<string> {
  const out = new Set<string>()
  for (const s of world.settlements ?? []) {
    if ((s.tier ?? 0) >= CAMP_TIER) out.add(s.lineage_id)
  }
  return out
}

/** A fight on the map. The latest one, when several are still going; the larger side's tribe is the one framed. */
function fight(world: FirstLookWorld, people: readonly Person[]): FirstLookTarget | null {
  const sizes = tribeSizes(people)
  let best: { tick: number; x: number; y: number; tribe: string } | null = null
  for (const battle of world.battles ?? []) {
    if (battle.ended) continue
    const loc = battle.location
    if (!loc || !Number.isFinite(loc[0]) || !Number.isFinite(loc[1])) continue
    const at = point(loc[0], loc[1])
    const tick = battle.started_tick ?? 0
    const sides = [...(battle.attackers ?? []), ...(battle.defenders ?? [])]
    const tribe = largestOf(sizes, sides) ?? sides[0] ?? largestOf(sizes)
    if (tribe === null) continue
    if (
      !best ||
      tick > best.tick ||
      (tick === best.tick && (at.x < best.x || (at.x === best.x && at.y < best.y)))
    ) {
      best = { tick, tribe, ...at }
    }
  }
  return best && { x: best.x, y: best.y, tribe: best.tribe }
}

function rivalKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`
}

function rivalsOf(world: FirstLookWorld): Set<string> {
  const out = new Set<string>()
  for (const r of world.tribal_relations ?? []) {
    if (r.status === 'rivals') out.add(rivalKey(r.a, r.b))
  }
  return out
}

/**
 * The closest two people of different tribes within meeting reach. At the same
 * distance a rivalry is the fight about to start, so it wins over a meeting.
 */
function meeting(people: readonly Person[], world: FirstLookWorld): FirstLookTarget | null {
  const rivals = rivalsOf(world)
  const sizes = tribeSizes(people)
  const index = buckets(people, MEET_REACH)
  let best: { d: number; fight: boolean; x: number; y: number; a: string; b: string } | null = null
  for (let i = 0; i < people.length; i++) {
    const p = people[i]
    for (const j of nearby(index, MEET_REACH, p.x, p.y)) {
      if (j <= i) continue
      const q = people[j]
      if (q.lineage === p.lineage) continue
      const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
      if (d > MEET_REACH) continue
      const fight = rivals.has(rivalKey(p.lineage, q.lineage))
      const at = point((p.x + q.x) / 2, (p.y + q.y) / 2)
      let replace = best === null || d < best.d
      if (best !== null && d === best.d) {
        replace = fight !== best.fight ? fight : at.x < best.x || (at.x === best.x && at.y < best.y)
      }
      if (replace) best = { d, fight, a: p.lineage, b: q.lineage, ...at }
    }
  }
  return best && { x: best.x, y: best.y, tribe: largestOf(sizes, [best.a, best.b]) ?? best.a }
}

/** The first hut nearest to standing: a tribe with no camp yet, and a site not finished. */
function raising(world: FirstLookWorld): FirstLookTarget | null {
  const founded = settled(world)
  let best: { progress: number; x: number; y: number; tribe: string } | null = null
  for (const building of world.buildings ?? []) {
    if (building.decorative || building.ruined) continue
    const lineage = building.owner_lineage || building.lineage_id
    if (!lineage || founded.has(lineage)) continue
    const progress = building.condition ?? building.construction_progress
    if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress >= 1) continue
    const at = point(building.x, building.y)
    if (
      !best ||
      progress > best.progress ||
      (progress === best.progress && (at.x < best.x || (at.x === best.x && at.y < best.y)))
    ) {
      best = { progress, tribe: lineage, ...at }
    }
  }
  return best && { x: best.x, y: best.y, tribe: best.tribe }
}

/**
 * A band that can peel off: kin within split reach, enough of them to go, and
 * enough of the tribe left behind. The smallest such band is the one nearest
 * the threshold.
 */
function split(people: readonly Person[]): FirstLookTarget | null {
  const tribe = new Map<string, number>()
  for (const p of people) tribe.set(p.lineage, (tribe.get(p.lineage) ?? 0) + 1)

  const parent = people.map((_, i) => i)
  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root]
    while (parent[i] !== root) {
      const next = parent[i]
      parent[i] = root
      i = next
    }
    return root
  }
  const index = buckets(people, SPLIT_REACH)
  for (let i = 0; i < people.length; i++) {
    const p = people[i]
    for (const j of nearby(index, SPLIT_REACH, p.x, p.y)) {
      if (j <= i || people[j].lineage !== p.lineage) continue
      if (Math.abs(people[j].x - p.x) + Math.abs(people[j].y - p.y) > SPLIT_REACH) continue
      const a = find(i)
      const b = find(j)
      if (a !== b) parent[a] = b
    }
  }

  const bands = new Map<number, { n: number; sx: number; sy: number; lineage: string }>()
  for (let i = 0; i < people.length; i++) {
    const root = find(i)
    const p = people[i]
    const band = bands.get(root)
    if (band) {
      band.n += 1
      band.sx += p.x
      band.sy += p.y
    } else bands.set(root, { n: 1, sx: p.x, sy: p.y, lineage: p.lineage })
  }

  let best: { n: number; x: number; y: number; tribe: string } | null = null
  for (const band of bands.values()) {
    const left = (tribe.get(band.lineage) ?? band.n) - band.n
    if (band.n < SPLIT_BAND || left < SPLIT_LEFT) continue
    const at = point(band.sx / band.n, band.sy / band.n)
    if (
      !best ||
      band.n < best.n ||
      (band.n === best.n && (at.x < best.x || (at.x === best.x && at.y < best.y)))
    ) {
      best = { n: band.n, tribe: band.lineage, ...at }
    }
  }
  return best && { x: best.x, y: best.y, tribe: best.tribe }
}

/**
 * The largest cluster of people. A tribe that has not founded a camp wins over
 * a larger one that already has: that cluster is the first settlement forming.
 */
function cluster(people: readonly Person[], world: FirstLookWorld): FirstLookTarget | null {
  const founded = settled(world)
  const cells = new Map<
    string,
    { lineage: string; cx: number; cy: number; n: number; sx: number; sy: number }
  >()
  for (const p of people) {
    const cx = Math.floor(p.x / CLUSTER_CELL)
    const cy = Math.floor(p.y / CLUSTER_CELL)
    const key = `${p.lineage}/${cx}/${cy}`
    const cell = cells.get(key)
    if (cell) {
      cell.n += 1
      cell.sx += p.x
      cell.sy += p.y
    } else cells.set(key, { lineage: p.lineage, cx, cy, n: 1, sx: p.x, sy: p.y })
  }

  const seen = new Set<string>()
  let best: { fresh: boolean; n: number; x: number; y: number; tribe: string } | null = null
  for (const start of cells.values()) {
    const startKey = `${start.lineage}/${start.cx}/${start.cy}`
    if (seen.has(startKey)) continue
    let n = 0
    let sx = 0
    let sy = 0
    const stack = [start]
    seen.add(startKey)
    while (stack.length > 0) {
      const cell = stack.pop()!
      n += cell.n
      sx += cell.sx
      sy += cell.sy
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const key = `${cell.lineage}/${cell.cx + dx}/${cell.cy + dy}`
          if (seen.has(key)) continue
          const next = cells.get(key)
          if (!next) continue
          seen.add(key)
          stack.push(next)
        }
      }
    }
    if (n < CLUSTER_MIN) continue
    const at = point(sx / n, sy / n)
    const fresh = !founded.has(start.lineage)
    let replace = best === null || (fresh && !best.fresh)
    if (best !== null && fresh === best.fresh) {
      replace = n > best.n || (n === best.n && (at.x < best.x || (at.x === best.x && at.y < best.y)))
    }
    if (replace) best = { fresh, n, tribe: start.lineage, ...at }
  }
  return best && { x: best.x, y: best.y, tribe: best.tribe }
}
