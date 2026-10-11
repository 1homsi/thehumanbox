//! Village carts (once a tribe knows the wheel). A village with a granary and fields it can reach by its own
//! roads keeps an ox cart. A harvest is not carried straight into the stores: it waits at its field until
//! the cart comes, and the cart hauls up to `CART_CAP` measures a trip to the nearest granary along the road
//! (the cells the village built, or people walked). A field whose harvest the cart cannot reach is brought in
//! by hand as before.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::sim::civ::land::village_roads::plan_road_avoiding;
use crate::sim::civ::land::village_stores::{self, occupied_tiles};
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::tech::railways::stop_of;
use crate::sim::transportation::{TransportKind, Vehicle};
use crate::world::grid::{TrailKind, ROAD_NONE};

/// Ticks between passes that spawn carts.
pub(crate) const CART_STEP: u64 = 120;
/// Ticks per tile a cart moves: one tile every `CART_STEP_TICKS` ticks.
pub(crate) const CART_STEP_TICKS: u64 = 2;
/// Measures of grain a cart carries in one trip.
pub(crate) const CART_CAP: u32 = 12;
/// Ticks a cart stands at a field or a granary while it is loaded or unloaded.
const DWELL_TICKS: u64 = 16;
/// Ticks a cart waits before it looks for work again, when it has none it can reach.
const IDLE_TICKS: u64 = 120;
const MAX_CARTS_PER_TRIBE: usize = 2;
/// Fields a cart tries, nearest first, before it waits for work.
const CART_CANDIDATES: usize = 4;
/// The longest way a cart drives, in tiles, and the share of it that must be busy: a road the village built,
/// or a path people have trodden (the walkers leave 0.06 a step; see `BUSY_TRAIL`).
const MAX_CART_PATH: usize = 40;
const ROAD_SHARE: f32 = 0.6;
const BUSY_TRAIL: f32 = 0.3;
/// How far from its granary a field may be for a cart to serve it, in tiles (Chebyshev).
const CART_REACH: i32 = 24;
/// Ticks grain may wait at a field for a cart before the hands bring it in (a road the cart needs may have
/// been built over since the harvest).
const STRANDED_GRAIN: u64 = 600;
/// The discovery a tribe needs to build carts.
const WHEEL: &str = "wheel";

/// Grain waiting at a field for a cart: `grain` measures of the harvest of the field at `at`, brought in at
/// tick `since`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CartGrain {
    pub lineage: String,
    pub at: [i32; 2],
    pub grain: u32,
    #[serde(default)]
    pub since: u64,
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

/// The stop of the tribe's first operational granary, where its carts unload.
fn granary_stop(sim: &Simulation, lineage: &str) -> Option<[i32; 2]> {
    sim.buildings
        .iter()
        .find(|b| {
            b.kind == BuildingKind::Granary
                && b.is_operational()
                && b.owner_lineage.as_deref() == Some(lineage)
        })
        .map(stop_of)
}

fn carts_of(sim: &Simulation, lineage: &str) -> usize {
    sim.vehicles
        .iter()
        .filter(|v| v.kind == TransportKind::Cart && v.owner_lineage == lineage)
        .count()
}

/// A cell carts drive on: a road or track built, or a path people have trodden.
fn is_busy_way(sim: &Simulation, x: i32, y: i32) -> bool {
    sim.grid.road_at(x, y) != ROAD_NONE || sim.grid.trail_at(x, y, TrailKind::Path) >= BUSY_TRAIL
}

/// A cart's route from `from` to `to` over busy ways: the cells after `from`, last first, so the cart pops the
/// next cell off the end. `None` when no such way is within reach.
fn plan_cart_route(sim: &Simulation, from: [i32; 2], to: [i32; 2]) -> Option<Vec<(i32, i32)>> {
    let occupied = occupied_tiles(sim);
    let blocked = |x: i32, y: i32| occupied.contains(&(x, y));
    let cheap = |x: i32, y: i32| is_busy_way(sim, x, y);
    let path = plan_road_avoiding(&sim.grid, from, to, &blocked, &cheap)?;
    if path.len() > MAX_CART_PATH {
        return None;
    }
    let busy = path.iter().filter(|p| is_busy_way(sim, p[0], p[1])).count();
    if (busy as f32) < ROAD_SHARE * path.len() as f32 {
        return None;
    }
    Some(path.iter().rev().map(|&[x, y]| (x, y)).collect())
}

/// Called when a field is harvested. Returns true when a cart of the tribe can carry the harvest to the
/// granary, so the grain waits at the field for it; false when the hands should carry it in as before.
pub(crate) fn haul_harvest(sim: &mut Simulation, lineage: &str, at: (i32, i32), grain: u32) -> bool {
    if grain == 0 || carts_of(sim, lineage) == 0 {
        return false;
    }
    let Some(stop) = granary_stop(sim, lineage) else {
        return false;
    };
    if plan_cart_route(sim, [at.0, at.1], stop).is_none() {
        return false;
    }
    sim.cart_grain.push(CartGrain {
        lineage: lineage.to_string(),
        at: [at.0, at.1],
        grain,
        since: sim.tick_count,
    });
    true
}

/// Spawns a cart for each tribe that knows the wheel, has a granary and a field it can drive to, and
/// carts are capped per tribe. Then every cart moves one tile per `CART_STEP_TICKS` ticks.
pub(crate) fn tick_carts(sim: &mut Simulation) {
    let now = sim.tick_count;
    if now > 0 && now.is_multiple_of(CART_STEP) {
        spawn_carts(sim);
    }
    if now.is_multiple_of(CART_STEP_TICKS) {
        run_carts(sim);
    }
}

/// Grain that has waited too long for a cart is brought in by hand after all.
fn release_stranded(sim: &mut Simulation) {
    let now = sim.tick_count;
    let stale: Vec<CartGrain> = sim
        .cart_grain
        .iter()
        .filter(|w| now.saturating_sub(w.since) >= STRANDED_GRAIN)
        .cloned()
        .collect();
    sim.cart_grain
        .retain(|w| now.saturating_sub(w.since) < STRANDED_GRAIN);
    for w in stale {
        let _ = village_stores::deposit(sim, &w.lineage, w.grain);
    }
}

fn spawn_carts(sim: &mut Simulation) {
    release_stranded(sim);
    let wheeled: BTreeSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.discoveries.contains(WHEEL))
        .map(|o| o.lineage_id.clone())
        .collect();
    for lineage in wheeled {
        if carts_of(sim, &lineage) >= MAX_CARTS_PER_TRIBE {
            continue;
        }
        let Some(stop) = granary_stop(sim, &lineage) else {
            continue;
        };
        let reachable = sim
            .farms
            .iter()
            .filter(|f| {
                f.owner_lineage == lineage && !f.harvested && chebyshev([f.x, f.y], stop) <= CART_REACH
            })
            .any(|f| plan_cart_route(sim, stop, [f.x, f.y]).is_some());
        if !reachable {
            continue;
        }
        let id = sim.next_vehicle_id;
        sim.next_vehicle_id += 1;
        sim.vehicles.push(Vehicle {
            id,
            kind: TransportKind::Cart,
            owner_lineage: lineage.clone(),
            x: stop[0],
            y: stop[1],
            occupants: Vec::new(),
            cargo: 0,
            route: Vec::new(),
            ready_tick: sim.tick_count,
            harbour: None,
            bound_for: None,
            ferry: None,
            rail_line: None,
        });
    }
}

fn run_carts(sim: &mut Simulation) {
    let now = sim.tick_count;
    for vi in 0..sim.vehicles.len() {
        let v = &sim.vehicles[vi];
        if v.kind != TransportKind::Cart || now < v.ready_tick {
            continue;
        }
        let lineage = v.owner_lineage.clone();
        let (under_way, loaded, here) = (!v.route.is_empty(), v.cargo > 0, [v.x, v.y]);
        if under_way {
            let (nx, ny) = sim.vehicles[vi]
                .route
                .pop()
                .unwrap_or((sim.vehicles[vi].x, sim.vehicles[vi].y));
            sim.vehicles[vi].x = nx;
            sim.vehicles[vi].y = ny;
            if sim.vehicles[vi].route.is_empty() {
                sim.vehicles[vi].bound_for = None;
                sim.vehicles[vi].ready_tick = now + DWELL_TICKS;
                if sim.vehicles[vi].cargo > 0 {
                    // At the granary: the grain goes in (what does not fit is lost to the spoiling heap).
                    let cargo = std::mem::take(&mut sim.vehicles[vi].cargo);
                    let _ = village_stores::deposit(sim, &lineage, cargo);
                } else {
                    // At a field: the grain waiting there is loaded.
                    let mut taken = 0;
                    for w in sim
                        .cart_grain
                        .iter_mut()
                        .filter(|w| w.lineage == lineage && w.at == [nx, ny])
                    {
                        let take = w.grain.min(CART_CAP - taken);
                        w.grain -= take;
                        taken += take;
                        if taken == CART_CAP {
                            break;
                        }
                    }
                    sim.cart_grain.retain(|w| w.grain > 0);
                    sim.vehicles[vi].cargo = taken;
                }
            }
            continue;
        }
        // Standing still: take the grain to the granary when loaded, otherwise go to the nearest waiting field.
        if loaded {
            let route = granary_stop(sim, &lineage)
                .and_then(|stop| plan_cart_route(sim, here, stop).map(|r| (r, stop)));
            match route {
                Some((r, stop)) => {
                    sim.vehicles[vi].route = r;
                    sim.vehicles[vi].bound_for = Some((stop[0], stop[1]));
                }
                None => sim.vehicles[vi].ready_tick = now + IDLE_TICKS,
            }
            continue;
        }
        // The nearest fields with grain waiting, the first the cart can drive to.
        let mut fields: Vec<[i32; 2]> = sim
            .cart_grain
            .iter()
            .filter(|w| w.lineage == lineage && w.grain > 0)
            .map(|w| w.at)
            .collect();
        fields.sort_by_key(|&at| (chebyshev(at, here), at));
        fields.dedup();
        let found = fields
            .into_iter()
            .take(CART_CANDIDATES)
            .find_map(|field| plan_cart_route(sim, here, field).map(|r| (r, field)));
        match found {
            Some((r, field)) => {
                sim.vehicles[vi].route = r;
                sim.vehicles[vi].bound_for = Some((field[0], field[1]));
            }
            None => sim.vehicles[vi].ready_tick = now + IDLE_TICKS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::era::Era;
    use crate::sim::tech::agriculture::{CropKind, Farm};
    use crate::sim::tech::buildings::Building;
    use crate::world::grid::{WorldGrid, ROAD_TRACK};
    use crate::world::tiles::Tile;

    const TRIBE: &str = "carters";

    /// Grass with a dirt road along y = 100 from a granary at (92, 98) to a field at (116, 100), and a tribe
    /// whose first person knows the wheel.
    fn village() -> Simulation {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        sim.vehicles.clear();
        sim.farms.clear();
        for y in 90..=110 {
            for x in 88..=130 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for x in 94..=116 {
            sim.grid.road[WorldGrid::idx(x, 100)] = ROAD_TRACK;
        }
        sim.organisms.truncate(20);
        for o in sim.organisms.iter_mut() {
            o.alive = true;
            o.lineage_id = TRIBE.to_string();
        }
        sim.lineage_eras.insert(TRIBE.to_string(), Era::Iron);
        let mut granary = Building::new(9001, BuildingKind::Granary, 92, 97, Some(TRIBE.to_string()), 0);
        granary.condition = 1.0;
        sim.buildings.push(granary);
        sim
    }

    /// A ripe field of the tribe at (116, 100), at the end of the road.
    fn field(sim: &mut Simulation) {
        sim.farms.push(Farm {
            id: 1,
            x: 116,
            y: 100,
            owner_lineage: TRIBE.to_string(),
            crop: CropKind::Wheat,
            planted_tick: 0,
            ready_tick: 0,
            harvested: false,
            prepared: false,
            season_timed: false,
            withered: false,
        });
    }

    fn wheeled(sim: &mut Simulation) {
        sim.organisms[0].discover(WHEEL);
    }

    fn run_to(sim: &mut Simulation, until: u64) {
        for t in 0..=until {
            sim.tick_count = t;
            if t > 0 && t.is_multiple_of(CART_STEP) {
                spawn_carts(sim);
            }
            if t.is_multiple_of(CART_STEP_TICKS) {
                run_carts(sim);
            }
        }
    }

    fn stock(sim: &Simulation) -> u32 {
        sim.buildings
            .iter()
            .find(|b| b.kind == BuildingKind::Granary)
            .map(|b| b.stock)
            .unwrap_or(0)
    }

    #[test]
    fn no_cart_before_the_wheel() {
        let mut sim = village();
        field(&mut sim);
        spawn_carts(&mut sim);
        assert_eq!(
            carts_of(&sim, TRIBE),
            0,
            "a tribe without the wheel builds no carts"
        );
        assert!(!haul_harvest(&mut sim, TRIBE, (116, 100), 10));
    }

    #[test]
    fn a_harvest_waits_at_the_field_and_the_cart_brings_it_to_the_granary() {
        let mut sim = village();
        wheeled(&mut sim);
        field(&mut sim);
        spawn_carts(&mut sim);
        assert_eq!(carts_of(&sim, TRIBE), 1, "one cart for the tribe");
        assert!(
            haul_harvest(&mut sim, TRIBE, (116, 100), 10),
            "the cart can reach the field"
        );
        assert_eq!(stock(&sim), 0, "the grain is not in the stores yet");
        run_to(&mut sim, 400);
        assert_eq!(stock(&sim), 10, "the cart brought the whole harvest in");
        assert!(sim.cart_grain.is_empty());
    }

    #[test]
    fn a_field_with_no_road_back_is_brought_in_by_hand() {
        let mut sim = village();
        wheeled(&mut sim);
        field(&mut sim);
        spawn_carts(&mut sim);
        for x in 94..=116 {
            sim.grid.road[WorldGrid::idx(x, 100)] = ROAD_NONE;
        }
        assert!(!haul_harvest(&mut sim, TRIBE, (116, 100), 10));
        assert!(sim.cart_grain.is_empty());
    }

    #[test]
    fn grain_no_cart_can_reach_is_brought_in_by_hand() {
        let mut sim = village();
        wheeled(&mut sim);
        field(&mut sim);
        spawn_carts(&mut sim);
        assert!(haul_harvest(&mut sim, TRIBE, (116, 100), 10));
        for x in 94..=116 {
            sim.grid.road[WorldGrid::idx(x, 100)] = ROAD_NONE;
        }
        run_to(&mut sim, 60 + STRANDED_GRAIN);
        assert!(sim.cart_grain.is_empty(), "the stranded harvest is released");
        assert_eq!(stock(&sim), 10, "and the hands bring it in");
    }

    #[test]
    fn a_cart_takes_no_more_than_its_load() {
        let mut sim = village();
        wheeled(&mut sim);
        field(&mut sim);
        spawn_carts(&mut sim);
        assert!(haul_harvest(&mut sim, TRIBE, (116, 100), 20));
        run_to(&mut sim, 60);
        let left: u32 = sim.cart_grain.iter().map(|w| w.grain).sum();
        assert_eq!(
            left,
            20 - CART_CAP,
            "one trip carries the cart's load and no more"
        );
    }
}
