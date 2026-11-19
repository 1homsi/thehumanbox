use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashSet};

use serde::{Deserialize, Serialize};

use crate::sim::simulation::Simulation;
use crate::world::grid::{WorldGrid, ROAD_BRIDGE, ROAD_NONE, ROAD_TRACK};
use crate::world::tiles::Tile;

/// Ticks between road passes.
pub const ROAD_STEP: u64 = 300;
/// Padding around a link's bounding box that the search may use (a detour round a ridge or a lake).
const SEARCH_PAD: i32 = 32;
/// Most cells one search may expand.
const SEARCH_BUDGET: usize = 20_000;

/// A road a village laid, from its centre to the point it links to.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct VillageRoad {
    pub lineage: String,
    pub from: [i32; 2],
    pub to: [i32; 2],
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

/// Lineages with at least one living member who knows how to build roads.
pub(crate) fn lineages_that_build_roads(sim: &Simulation) -> HashSet<String> {
    sim.organisms
        .iter()
        .filter(|o| o.alive && o.discoveries.contains("road_building"))
        .map(|o| o.lineage_id.to_string())
        .collect()
}

/// Cheapest walk from `from` to `to` over open ground, as the cells after `from` up to and including
/// `to`. Roads are preferred (cost 1 against 2 on open ground); water, rock and buildings are not walked,
/// except that the two ends may sit on anything walkable (a village centre is on a hut).
pub fn plan_road(grid: &WorldGrid, from: [i32; 2], to: [i32; 2]) -> Option<Vec<[i32; 2]>> {
    plan_road_avoiding(
        grid,
        from,
        to,
        &|_, _| false,
        &|x, y| grid.road_at(x, y) != ROAD_NONE,
        None,
    )
}

/// Cost of a step onto water when a bridge is planned (open ground costs 2, a road 1).
const BRIDGE_WATER_COST: u32 = 3;
/// The widest stretch of water a bridge crosses, in tiles.
pub(crate) const MAX_SPAN: usize = 6;

/// A way from `from` to `to` that crosses water on bridges: each stretch of water it crosses is at most
/// `MAX_SPAN` tiles wide. `None` when the way is dry (`plan_road` already finds it) or no such crossing exists.
pub fn plan_bridge(grid: &WorldGrid, from: [i32; 2], to: [i32; 2]) -> Option<Vec<[i32; 2]>> {
    let path = plan_road_avoiding(
        grid,
        from,
        to,
        &|_, _| false,
        &|x, y| grid.road_at(x, y) != ROAD_NONE,
        Some(BRIDGE_WATER_COST),
    )?;
    let mut run = 0;
    let mut crosses = false;
    for &[x, y] in &path {
        if grid.get(x, y) == Tile::Water && grid.road_at(x, y) != ROAD_BRIDGE {
            run += 1;
            crosses = true;
            if run > MAX_SPAN {
                return None;
            }
        } else {
            run = 0;
        }
    }
    crosses.then_some(path)
}

/// `plan_road` that also keeps off the cells `blocked` names (building footprints, say), and walks the cells
/// `cheap` names at cost 1 (open ground costs 2). With `water` set, water may be walked at that cost (a
/// bridge's way). The end cell is always allowed.
pub fn plan_road_avoiding(
    grid: &WorldGrid,
    from: [i32; 2],
    to: [i32; 2],
    blocked: &dyn Fn(i32, i32) -> bool,
    cheap: &dyn Fn(i32, i32) -> bool,
    water: Option<u32>,
) -> Option<Vec<[i32; 2]>> {
    let step = |nx: i32, ny: i32, _: i32, _: i32, target: bool| {
        if !(target || grid.get(nx, ny).road_ground() || grid.road_at(nx, ny) == ROAD_TRACK) {
            return None;
        }
        if !target && blocked(nx, ny) {
            return None;
        }
        Some(if cheap(nx, ny) { 1 } else { 2 })
    };
    let way = Way {
        step: &step,
        bridge: water.map(|per_tile| (per_tile, Some(2))),
        weight: 1,
    };
    plan_way(grid, from, to, &way)
}

pub(crate) type StepCost<'a> = dyn Fn(i32, i32, i32, i32, bool) -> Option<u32> + 'a;

pub(crate) struct Way<'a> {
    pub step: &'a StepCost<'a>,
    pub bridge: Option<(u32, Option<u32>)>,
    pub weight: u32,
}

pub(crate) fn plan_way(grid: &WorldGrid, from: [i32; 2], to: [i32; 2], way: &Way) -> Option<Vec<[i32; 2]>> {
    let x0 = from[0].min(to[0]) - SEARCH_PAD;
    let y0 = from[1].min(to[1]) - SEARCH_PAD;
    let x1 = from[0].max(to[0]) + SEARCH_PAD;
    let y1 = from[1].max(to[1]) + SEARCH_PAD;
    let w = (x1 - x0 + 1) as usize;
    let h = (y1 - y0 + 1) as usize;
    let index = |x: i32, y: i32| ((y - y0) as usize) * w + (x - x0) as usize;
    let inside = |x: i32, y: i32| x >= x0 && x <= x1 && y >= y0 && y <= y1;
    let guess = |x: i32, y: i32| chebyshev([x, y], to) as u32 * way.weight;
    let mut cost = vec![u32::MAX; w * h];
    let mut parent = vec![usize::MAX; w * h];
    let mut frontier = BinaryHeap::new();
    let start = index(from[0], from[1]);
    cost[start] = 0;
    frontier.push(Reverse((guess(from[0], from[1]), 0u32, from[0], from[1])));
    let mut expanded = 0;
    while let Some(Reverse((_, g, x, y))) = frontier.pop() {
        if cost[index(x, y)] != g {
            continue;
        }
        if [x, y] == to {
            let mut path = Vec::new();
            let mut at = index(x, y);
            while at != start {
                let (ax, ay) = (x0 + (at % w) as i32, y0 + (at / w) as i32);
                let up = parent[at];
                let (px, py) = (x0 + (up % w) as i32, y0 + (up / w) as i32);
                path.push([ax, ay]);
                // A bridge's span: the water tiles between the bank it left and the bank it reached.
                let (sx, sy) = ((px - ax).signum(), (py - ay).signum());
                let (mut cx, mut cy) = (ax + sx, ay + sy);
                while (cx, cy) != (px, py) && (px - ax).abs().max((py - ay).abs()) > 1 {
                    path.push([cx, cy]);
                    cx += sx;
                    cy += sy;
                }
                at = up;
            }
            path.reverse();
            return Some(path);
        }
        expanded += 1;
        if expanded > SEARCH_BUDGET {
            return None;
        }
        // A bridge is built the way real ones are: one straight span from bank to bank, square to the water.
        // From dry ground, each of the four straight ways is looked along: across at most `MAX_SPAN` tiles of
        // water to the first dry tile beyond, which is reached in one step that carries the whole span. Water is
        // never a place the search stands on, so no span can turn over the water or be cut short.
        if let Some((per_tile, landing)) = way.bridge {
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let mut k = 1;
                while k <= MAX_SPAN as i32 + 1 {
                    let (nx, ny) = (x + dx * k, y + dy * k);
                    if !inside(nx, ny) || !WorldGrid::in_bounds(nx, ny) {
                        break;
                    }
                    if grid.get(nx, ny) == Tile::Water {
                        k += 1;
                        continue;
                    }
                    let target = [nx, ny] == to;
                    let lands = (way.step)(nx, ny, nx - dx, ny - dy, target);
                    if let (true, Some(land)) = (k >= 2, lands) {
                        let next = g + per_tile * (k as u32 - 1) + landing.unwrap_or(land);
                        let idx = index(nx, ny);
                        if next < cost[idx] {
                            cost[idx] = next;
                            parent[idx] = index(x, y);
                            frontier.push(Reverse((next + guess(nx, ny), next, nx, ny)));
                        }
                    }
                    break;
                }
            }
        }
        for dx in -1..=1 {
            for dy in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if !inside(nx, ny) || !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let Some(step) = (way.step)(nx, ny, x, y, [nx, ny] == to) else {
                    continue;
                };
                let next = g + step;
                let idx = index(nx, ny);
                if next < cost[idx] {
                    cost[idx] = next;
                    parent[idx] = index(x, y);
                    frontier.push(Reverse((next + guess(nx, ny), next, nx, ny)));
                }
            }
        }
    }
    None
}

#[cfg(test)]
/// Mark each cell of `path` as a road where the ground takes one. Returns how many cells changed.
fn lay(grid: &mut WorldGrid, path: &[[i32; 2]], built: &dyn Fn(i32, i32) -> bool) -> usize {
    let mut changed = 0;
    for &[x, y] in path {
        let tile = grid.get(x, y);
        if !tile.road_ground() || grid.road_at(x, y) != ROAD_NONE || built(x, y) {
            continue;
        }
        grid.road[WorldGrid::idx(x, y)] = ROAD_TRACK;
        changed += 1;
    }
    changed
}

#[cfg(test)]
/// Lays a bridge on each water cell of `path`. Returns how many cells changed.
fn lay_bridges(grid: &mut WorldGrid, path: &[[i32; 2]]) -> usize {
    let mut changed = 0;
    for &[x, y] in path {
        if grid.get(x, y) == Tile::Water && grid.road_at(x, y) != ROAD_BRIDGE {
            grid.road[WorldGrid::idx(x, y)] = ROAD_BRIDGE;
            changed += 1;
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::tiles::Tile;

    /// A rock wall with its only gap far to the north: a walk must go round it.
    fn walled() -> WorldGrid {
        let mut grid = WorldGrid::new(1);
        for y in 60..140 {
            for x in 60..140 {
                grid.set(x, y, Tile::Grass);
            }
        }
        for y in 70..=130 {
            grid.set(100, y, Tile::Rock);
        }
        grid
    }

    #[test]
    fn a_road_goes_round_a_wall_over_open_ground() {
        let grid = walled();
        let path = plan_road(&grid, [90, 100], [110, 100]).expect("a road round the wall");
        assert_eq!(path.last(), Some(&[110, 100]));
        assert!(path.iter().all(|&[x, y]| grid.get(x, y).walkable()));
        assert!(
            path.iter().any(|&[_, y]| !(70..=130).contains(&y)),
            "the way round goes past the wall's ends"
        );
    }

    #[test]
    fn a_road_does_not_cross_deep_water() {
        let mut grid = WorldGrid::new(1);
        for y in 60..140 {
            for x in 60..140 {
                grid.set(x, y, Tile::Grass);
            }
        }
        for y in 60..140 {
            grid.set(100, y, Tile::Water);
            grid.depth[WorldGrid::idx(100, y)] = 0.5;
        }
        assert!(
            plan_road(&grid, [90, 100], [110, 100]).is_none(),
            "no road over a river with no bridge"
        );
    }

    #[test]
    fn a_bridge_runs_straight_from_bank_to_bank() {
        // A strait four tiles wide, crossed at a slant: the bridge still goes straight across it.
        let mut grid = WorldGrid::new(1);
        for y in 80..140 {
            for x in 80..140 {
                grid.set(x, y, Tile::Grass);
            }
        }
        for y in 80..140 {
            for x in 108..112 {
                grid.set(x, y, Tile::Water);
            }
        }
        let path = plan_bridge(&grid, [100, 100], [120, 112]).expect("a bridge");
        let wet: Vec<[i32; 2]> = path
            .iter()
            .copied()
            .filter(|&[x, y]| grid.get(x, y) == Tile::Water)
            .collect();
        assert_eq!(
            wet.len(),
            4,
            "the bridge spans the strait once, square to it: {wet:?}"
        );
        assert!(
            wet.iter().all(|&[_, y]| y == wet[0][1]),
            "the bridge turns over the water: {wet:?}"
        );
        // Each end of the span lands on the bank straight ahead.
        let first = path.iter().position(|&p| p == wet[0]).unwrap();
        let last = path.iter().position(|&p| p == wet[3]).unwrap();
        assert_eq!(path[first - 1][1], wet[0][1]);
        assert_eq!(path[last + 1][1], wet[3][1]);
    }

    #[test]
    fn laying_a_path_marks_open_ground_and_skips_the_rest() {
        let mut grid = walled();
        grid.set(92, 100, Tile::Water);
        let laid = lay(&mut grid, &[[91, 100], [92, 100], [93, 100]], &|_, _| false);
        assert_eq!(laid, 2, "the water cell stays bare");
        assert_eq!(grid.road_at(91, 100), ROAD_TRACK);
        assert_eq!(grid.road_at(92, 100), ROAD_NONE);
        assert_eq!(
            lay(&mut grid, &[[91, 100]], &|_, _| false),
            0,
            "a road already there is not counted twice"
        );
    }

    /// Grass on both banks, and a river `width` tiles wide running north to south at x = 100.
    fn river(width: i32) -> WorldGrid {
        let mut grid = WorldGrid::new(1);
        for y in 60..140 {
            for x in 60..140 {
                grid.set(x, y, Tile::Grass);
            }
        }
        for y in 60..140 {
            for x in 100..100 + width {
                grid.set(x, y, Tile::Water);
                grid.depth[WorldGrid::idx(x, y)] = 0.5;
            }
        }
        grid
    }

    #[test]
    fn a_narrow_river_is_crossed_on_a_bridge() {
        let mut grid = river(4);
        assert!(
            plan_road(&grid, [90, 100], [110, 100]).is_none(),
            "no dry way across"
        );
        let path = plan_bridge(&grid, [90, 100], [110, 100]).expect("a bridge over the river");
        assert_eq!(path.last(), Some(&[110, 100]));
        let laid = lay_bridges(&mut grid, &path);
        let wet: Vec<[i32; 2]> = path
            .iter()
            .copied()
            .filter(|p| grid.get(p[0], p[1]) == Tile::Water)
            .collect();
        assert_eq!(
            laid,
            wet.len(),
            "one bridge cell on each tile of water the way crosses"
        );
        assert!(!wet.is_empty());
        for &[x, y] in &wet {
            assert_eq!(grid.road_at(x, y), ROAD_BRIDGE);
            assert!(!grid.wet_at(x, y), "a bridge is walked, not waded");
        }
    }

    #[test]
    fn a_wide_river_is_not_bridged() {
        let grid = river(MAX_SPAN as i32 + 2);
        assert!(
            plan_bridge(&grid, [90, 100], [120, 100]).is_none(),
            "too wide for a bridge"
        );
    }

    #[test]
    fn only_tribes_that_know_roads_are_listed() {
        let mut sim = Simulation::new(3);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].lineage_id = "road-builders".to_string().into();
        assert!(lineages_that_build_roads(&sim).is_empty());
        sim.organisms[0].discover("road_building");
        assert!(lineages_that_build_roads(&sim).contains("road-builders"));
    }
}
