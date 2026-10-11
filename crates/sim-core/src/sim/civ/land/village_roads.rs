//! Villages lay roads. A tribe that knows how to build roads (`road_building`) links its villages to
//! the nearest well, field or other village within reach, along the cheapest walk over open ground.
//! Each new link is one chronicle line.
//!
//! Bounded so the map does not fill with roads: one new link per tribe and at most two per pass, a
//! tribe holds at most `MAX_LINKS_PER_TRIBE` links, and the world at most `MAX_LINKS`.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashSet};

use serde::{Deserialize, Serialize};

use crate::sim::civ::settlements::{self, SettlementSnapshot};
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::world::grid::{WorldGrid, ROAD_NONE, ROAD_TRACK};

/// Ticks between road passes.
pub const ROAD_STEP: u64 = 300;
/// Tier of a village (see `settlements::TIER_NAMES`: wilderness, camp, hamlet, village, ...).
const VILLAGE_TIER: u8 = 3;
/// How far a village will reach for another village, in tiles.
const VILLAGE_REACH: i32 = 40;
/// How far a village reaches for its own wells and fields.
const NEAR_REACH: i32 = 24;
const MAX_LINKS_PER_TRIBE: usize = 12;
const MAX_LINKS: usize = 240;
const MAX_LINKS_PER_PASS: usize = 2;
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

/// Where a village may link to next, and what the chronicle calls it.
struct Goal {
    point: [i32; 2],
    label: String,
    distance: i32,
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

/// Lineages with at least one living member who knows how to build roads.
fn lineages_that_build_roads(sim: &Simulation) -> HashSet<String> {
    sim.organisms
        .iter()
        .filter(|o| o.alive && o.discoveries.contains("road_building"))
        .map(|o| o.lineage_id.clone())
        .collect()
}

fn already_linked(sim: &Simulation, a: [i32; 2], b: [i32; 2]) -> bool {
    sim.village_roads
        .iter()
        .any(|r| (r.from == a && r.to == b) || (r.from == b && r.to == a))
}

/// The nearest point this village should link to: its own operational wells and fields, and the
/// centre of another village in reach. Points already linked are skipped.
fn next_goal(
    sim: &Simulation,
    village: &SettlementSnapshot,
    villages: &[SettlementSnapshot],
) -> Option<Goal> {
    let mut best: Option<Goal> = None;
    let mut consider = |point: [i32; 2], label: String, reach: i32| {
        let distance = chebyshev(village.center, point);
        if distance == 0 || distance > reach || already_linked(sim, village.center, point) {
            return;
        }
        let better = match &best {
            None => true,
            Some(current) => (distance, &label) < (current.distance, &current.label),
        };
        if better {
            best = Some(Goal {
                point,
                label,
                distance,
            });
        }
    };
    for building in sim.buildings.iter() {
        if building.kind == BuildingKind::Well
            && building.is_operational()
            && building.owner_lineage.as_deref() == Some(village.lineage_id.as_str())
        {
            consider([building.x, building.y], "the well".to_string(), NEAR_REACH);
        }
    }
    for farm in sim.farms.iter().filter(|f| f.owner_lineage == village.lineage_id) {
        consider([farm.x, farm.y], "the fields".to_string(), NEAR_REACH);
    }
    for other in villages
        .iter()
        .filter(|v| v.lineage_id != village.lineage_id || v.center != village.center)
    {
        let label = format!("the village of {}", other.name);
        consider(other.center, label, VILLAGE_REACH);
    }
    best
}

/// Cheapest walk from `from` to `to` over open ground, as the cells after `from` up to and including
/// `to`. Roads are preferred (cost 1 against 2 on open ground); water, rock and buildings are not walked,
/// except that the two ends may sit on anything walkable (a village centre is on a hut).
pub fn plan_road(grid: &WorldGrid, from: [i32; 2], to: [i32; 2]) -> Option<Vec<[i32; 2]>> {
    plan_road_avoiding(grid, from, to, &|_, _| false, &|x, y| {
        grid.road_at(x, y) != ROAD_NONE
    })
}

/// `plan_road` that also keeps off the cells `blocked` names (building footprints, say), and walks the cells
/// `cheap` names at cost 1 (open ground costs 2). The end cell is always allowed.
pub fn plan_road_avoiding(
    grid: &WorldGrid,
    from: [i32; 2],
    to: [i32; 2],
    blocked: &dyn Fn(i32, i32) -> bool,
    cheap: &dyn Fn(i32, i32) -> bool,
) -> Option<Vec<[i32; 2]>> {
    let x0 = from[0].min(to[0]) - SEARCH_PAD;
    let y0 = from[1].min(to[1]) - SEARCH_PAD;
    let x1 = from[0].max(to[0]) + SEARCH_PAD;
    let y1 = from[1].max(to[1]) + SEARCH_PAD;
    let w = (x1 - x0 + 1) as usize;
    let h = (y1 - y0 + 1) as usize;
    let index = |x: i32, y: i32| ((y - y0) as usize) * w + (x - x0) as usize;
    let inside = |x: i32, y: i32| x >= x0 && x <= x1 && y >= y0 && y <= y1;
    let mut cost = vec![u32::MAX; w * h];
    let mut parent = vec![usize::MAX; w * h];
    let mut frontier = BinaryHeap::new();
    let start = index(from[0], from[1]);
    cost[start] = 0;
    frontier.push(Reverse((chebyshev(from, to) as u32, 0u32, from[0], from[1])));
    let mut expanded = 0;
    while let Some(Reverse((_, g, x, y))) = frontier.pop() {
        if cost[index(x, y)] != g {
            continue;
        }
        if [x, y] == to {
            let mut path = Vec::new();
            let mut at = index(x, y);
            while at != start {
                path.push([x0 + (at % w) as i32, y0 + (at / w) as i32]);
                at = parent[at];
            }
            path.reverse();
            return Some(path);
        }
        expanded += 1;
        if expanded > SEARCH_BUDGET {
            return None;
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
                let target = [nx, ny] == to;
                let tile = grid.get(nx, ny);
                if !(target || tile.road_ground() || grid.road_at(nx, ny) == ROAD_TRACK) {
                    continue;
                }
                if !target && blocked(nx, ny) {
                    continue;
                }
                let step = if cheap(nx, ny) { 1 } else { 2 };
                let next = g + step;
                let idx = index(nx, ny);
                if next < cost[idx] {
                    cost[idx] = next;
                    parent[idx] = index(x, y);
                    let h = chebyshev([nx, ny], to) as u32;
                    frontier.push(Reverse((next + h, next, nx, ny)));
                }
            }
        }
    }
    None
}

/// Mark each cell of `path` as a road where the ground takes one. Returns how many cells changed.
fn lay(grid: &mut WorldGrid, path: &[[i32; 2]]) -> usize {
    let mut changed = 0;
    for &[x, y] in path {
        let tile = grid.get(x, y);
        if !tile.road_ground() || grid.road_at(x, y) != ROAD_NONE {
            continue;
        }
        grid.road[WorldGrid::idx(x, y)] = ROAD_TRACK;
        changed += 1;
    }
    changed
}

/// One road pass: the villages of tribes that know roads each reach for their nearest link.
pub(crate) fn tick_village_roads(sim: &mut Simulation) {
    if sim.village_roads.len() >= MAX_LINKS {
        return;
    }
    let knowing = lineages_that_build_roads(sim);
    let snapshots = settlements::snapshots(sim);
    let villages: Vec<SettlementSnapshot> =
        snapshots.into_iter().filter(|s| s.tier >= VILLAGE_TIER).collect();
    let mut laid = 0;
    for village in villages.iter().filter(|v| knowing.contains(&v.lineage_id)) {
        if laid >= MAX_LINKS_PER_PASS || sim.village_roads.len() >= MAX_LINKS {
            break;
        }
        let built = sim
            .village_roads
            .iter()
            .filter(|r| r.lineage == village.lineage_id)
            .count();
        if built >= MAX_LINKS_PER_TRIBE {
            continue;
        }
        let Some(goal) = next_goal(sim, village, &villages) else {
            continue;
        };
        let Some(path) = plan_road(&sim.grid, village.center, goal.point) else {
            continue;
        };
        if lay(&mut sim.grid, &path) == 0 {
            continue;
        }
        sim.village_roads.push(VillageRoad {
            lineage: village.lineage_id.clone(),
            from: village.center,
            to: goal.point,
        });
        let line = format!("The people of {} laid a road to {}.", village.name, goal.label);
        sim.headlines.push_back((sim.tick_count, line));
        laid += 1;
    }
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
    fn laying_a_path_marks_open_ground_and_skips_the_rest() {
        let mut grid = walled();
        grid.set(92, 100, Tile::Water);
        let laid = lay(&mut grid, &[[91, 100], [92, 100], [93, 100]]);
        assert_eq!(laid, 2, "the water cell stays bare");
        assert_eq!(grid.road_at(91, 100), ROAD_TRACK);
        assert_eq!(grid.road_at(92, 100), ROAD_NONE);
        assert_eq!(
            lay(&mut grid, &[[91, 100]]),
            0,
            "a road already there is not counted twice"
        );
    }

    #[test]
    fn only_tribes_that_know_roads_are_listed() {
        let mut sim = Simulation::new(3);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].lineage_id = "road-builders".to_string();
        assert!(lineages_that_build_roads(&sim).is_empty());
        sim.organisms[0].discover("road_building");
        assert!(lineages_that_build_roads(&sim).contains("road-builders"));
    }
}
