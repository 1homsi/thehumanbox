// Finds a tile to photograph in a saved world. Pure functions over the frame JSON the simulation
// returns from `fullFrame` (no browser, no wasm), so the same choice is made on every machine.
//
// Features:
//   building:<kind>   a finished, standing building of that kind (bare <kind> works too: market, gate, tower)
//   caravan[:<cargo>] a caravan on the road at the frame's tick (its straight line from -> to)
//   boat              a boat (any era, sailing or moored)
//   field             a farm plot (the frame's `farms`)
//
// Candidates are sorted by distance to the nearest settlement centre, then by x, then by y, so
// `index` picks the same one every time. Pass `index` to pick another candidate.

/** Where a caravan is at `tick`, in tiles: the straight line the map draws between its two ends. */
export function caravanAt(caravan, tick) {
  const duration = Math.max(1, caravan.arrives_tick - caravan.departed_tick)
  const t = Math.max(0, Math.min(1, (tick - caravan.departed_tick) / duration))
  return {
    x: caravan.from[0] + (caravan.to[0] - caravan.from[0]) * t,
    y: caravan.from[1] + (caravan.to[1] - caravan.from[1]) * t,
    progress: t,
  }
}

/** Counts of what the frame holds, for choosing a feature (`--list`). */
export function summarize(frame) {
  const buildings = {}
  for (const b of frame.buildings ?? []) {
    if (b.ruined) continue
    buildings[b.kind] = (buildings[b.kind] ?? 0) + 1
  }
  const cargo = {}
  for (const c of frame.caravans ?? []) cargo[c.cargo] = (cargo[c.cargo] ?? 0) + 1
  const boats = (frame.vehicles ?? []).filter((v) => v.kind === 'boat').length
  return {
    tick: frame.tick,
    people: (frame.organisms ?? []).filter((o) => o.alive).length,
    buildings,
    caravans: { count: (frame.caravans ?? []).length, cargo },
    boats,
    fields: (frame.farms ?? []).length,
  }
}

function distanceToNearestSettlement(frame, x, y) {
  const centres = (frame.settlements ?? []).map((s) => s.center)
  if (centres.length === 0) return 0
  let best = Infinity
  for (const [cx, cy] of centres) best = Math.min(best, (cx - x) ** 2 + (cy - y) ** 2)
  return best
}

function byTownThenPosition(frame) {
  return (a, b) =>
    distanceToNearestSettlement(frame, a.x, a.y) - distanceToNearestSettlement(frame, b.x, b.y) ||
    a.x - b.x ||
    a.y - b.y
}

/** The candidates for a feature, in choice order. Each has x, y (tiles), name and the source entity. */
export function candidatesFor(frame, feature, tick = frame.tick) {
  const [head, arg] = feature.split(':')
  const sortBy = byTownThenPosition(frame)
  if (head === 'caravan') {
    return (frame.caravans ?? [])
      .filter((c) => !arg || c.cargo === arg)
      .map((c) => ({ entity: c, kind: 'caravan', name: `caravan-${c.cargo}`, ...caravanAt(c, tick) }))
      .filter((p) => p.progress >= 0.1 && p.progress <= 0.95)
      .map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }))
      .sort(sortBy)
  }
  if (head === 'boat') {
    return (frame.vehicles ?? [])
      .filter((v) => v.kind === 'boat')
      .map((v) => ({ entity: v, kind: 'boat', name: `boat-${v.era ?? 'any'}`, x: v.x, y: v.y }))
      .sort(sortBy)
  }
  if (head === 'field') {
    return (frame.farms ?? [])
      .map((f) => ({ entity: f, kind: 'field', name: `field-${f.crop ?? 'plot'}`, x: f.x, y: f.y }))
      .sort(sortBy)
  }
  const kind = head === 'building' ? arg : head
  return (frame.buildings ?? [])
    .filter((b) => b.kind === kind && !b.ruined && (b.construction_progress ?? 1) >= 1)
    .map((b) => ({ entity: b, kind: 'building', name: kind, x: b.x, y: b.y }))
    .sort(sortBy)
}

/**
 * The feature's tile (`index`-th candidate). Throws with the kinds the frame does hold when there is none.
 * `tick` defaults to the frame's; a caravan's position is read at that tick.
 */
export function findFeature(frame, feature, { index = 0, tick = frame.tick } = {}) {
  const list = candidatesFor(frame, feature, tick)
  if (list.length === 0) {
    const have = summarize(frame)
    throw new Error(
      `no "${feature}" in this world at tick ${frame.tick} (buildings: ${JSON.stringify(have.buildings)}, ` +
        `caravans: ${have.caravans.count}, boats: ${have.boats}, fields: ${have.fields}). ` +
        `Features: building:<kind>, caravan[:<cargo>], boat, field.`,
    )
  }
  if (index < 0 || index >= list.length) {
    throw new Error(`index ${index} out of range: ${list.length} candidates for "${feature}"`)
  }
  const pick = list[index]
  return { ...pick, index, candidates: list.length, feature, tick }
}
