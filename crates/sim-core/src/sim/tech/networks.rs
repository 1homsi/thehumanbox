use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::hashing::{FxHashMap, FxHashSet};
use crate::sim::civ::civ_tick::town::town_reserved;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::sim::tech::railways::{station_at, stop_of, RailLine, BUSY_TRAIL};
use crate::sim::transportation::TransportKind;
use crate::sim::world_events::push_event;
use crate::world::grid::{TrailKind, WorldGrid, ROAD_BRIDGE, ROAD_NONE, ROAD_RAIL, ROAD_TRACK, WIDTH};

pub(crate) const POWER_SOURCES: [BuildingKind; 6] = [
    BuildingKind::PowerPlant,
    BuildingKind::FusionPlant,
    BuildingKind::WindFarm,
    BuildingKind::SolarArray,
    BuildingKind::WindTurbine,
    BuildingKind::SolarPanel,
];

const STATION_REACH: i32 = 4;
const RAIL_TO_TRACK_DAYS: u8 = 1;
const REMNANT_GONE_DAYS: u8 = 4;
pub(crate) const ORPHAN_WEAR: f32 = 0.35;
pub(crate) const CLUTTER_WEAR: f32 = 0.05;
const PROP_REACH: i32 = 16;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RailRemnant {
    pub at: [i32; 2],
    pub days: u8,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NetworkStrays {
    pub stray_rail: usize,
    pub stations_without_line: usize,
    pub substations_without_grid: usize,
    pub ways_under_buildings: usize,
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

fn footprint_tiles(b: &Building) -> impl Iterator<Item = (i32, i32)> + '_ {
    let (w, h) = b.footprint();
    (b.y..b.y + i32::from(h)).flat_map(move |y| (b.x..b.x + i32::from(w)).map(move |x| (x, y)))
}

fn covered_tiles(sim: &Simulation) -> FxHashSet<(i32, i32)> {
    sim.buildings
        .iter()
        .filter(|b| !b.decorative)
        .flat_map(footprint_tiles)
        .collect()
}

fn living_lineages(sim: &Simulation) -> FxHashSet<&str> {
    sim.organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect()
}

fn rail_cells(line: &RailLine) -> impl Iterator<Item = [i32; 2]> + '_ {
    std::iter::once(line.a).chain(line.path.iter().copied())
}

fn line_is_live(
    sim: &Simulation,
    line: &RailLine,
    living: &FxHashSet<&str>,
    covered: &FxHashSet<(i32, i32)>,
) -> bool {
    let alive = |lineage: &str| lineage.is_empty() || living.contains(lineage);
    alive(&line.lineage)
        && line.towns.iter().all(|town| alive(town))
        && station_at(sim, &line.lineage, line.a)
        && station_at(sim, &line.lineage, line.b)
        && !rail_cells(line).any(|[x, y]| covered.contains(&(x, y)))
}

fn owned_cells<'a>(lines: impl Iterator<Item = &'a RailLine>) -> FxHashSet<usize> {
    lines
        .flat_map(rail_cells)
        .filter(|&[x, y]| WorldGrid::in_bounds(x, y))
        .map(|[x, y]| WorldGrid::idx(x, y))
        .collect()
}

fn near_a_line_end(stop: [i32; 2], ends: &[[i32; 2]]) -> bool {
    ends.iter().any(|&end| chebyshev(end, stop) <= STATION_REACH)
}

fn powered_lineages(sim: &Simulation) -> FxHashSet<&str> {
    sim.buildings
        .iter()
        .filter(|b| !b.decorative && !b.is_ruined() && POWER_SOURCES.contains(&b.kind))
        .filter_map(|b| b.owner_lineage.as_deref())
        .collect()
}

fn unpowered(b: &Building, powered: &FxHashSet<&str>) -> bool {
    b.owner_lineage.as_deref().is_none_or(|l| !powered.contains(l))
}

#[cfg(test)]
pub(crate) fn orphaned_infrastructure(sim: &Simulation) -> FxHashSet<u32> {
    orphans(sim).into_keys().collect()
}

fn kept_in_use(kind: BuildingKind) -> bool {
    crate::sim::civ::vacancy::is_home(kind)
        || kind.needs_shore()
        || matches!(
            kind,
            BuildingKind::Shipyard | BuildingKind::Warehouse | BuildingKind::Well | BuildingKind::Bridge
        )
}

pub(crate) fn orphans(sim: &Simulation) -> FxHashMap<u32, f32> {
    let mut out = FxHashMap::default();
    let ends: Vec<[i32; 2]> = sim.rail_lines.iter().flat_map(|l| [l.a, l.b]).collect();
    let powered = powered_lineages(sim);
    let living = living_lineages(sim);
    let towns: FxHashMap<u32, &crate::sim::civ::civ_tick::town::Town> =
        sim.towns.iter().map(|t| (t.id, t)).collect();
    let settled: FxHashSet<&str> = sim.towns.iter().map(|t| t.lineage.as_str()).collect();
    for b in &sim.buildings {
        let owner = b.owner_lineage.as_deref();
        let unanchored = owner.is_some_and(|l| living.contains(l) && !settled.contains(l));
        let wear = if b.decorative {
            let near = b
                .town
                .and_then(|id| towns.get(&id))
                .is_some_and(|t| t.distance(b.x, b.y) <= PROP_REACH);
            (!near && !unanchored).then_some(CLUTTER_WEAR)
        } else {
            match b.kind {
                BuildingKind::TrainStation if !near_a_line_end(stop_of(b), &ends) => Some(ORPHAN_WEAR),
                BuildingKind::Substation if unpowered(b, &powered) => Some(ORPHAN_WEAR),
                kind if b.town.is_none()
                    && !kept_in_use(kind)
                    && owner.is_some_and(|l| settled.contains(l) && living.contains(l)) =>
                {
                    Some(CLUTTER_WEAR)
                }
                _ => None,
            }
        };
        if let Some(wear) = wear {
            out.insert(b.id, wear);
        }
    }
    out
}

pub fn unowned_infrastructure(sim: &Simulation) -> Vec<(BuildingKind, i32, i32)> {
    let living = living_lineages(sim);
    let fading = orphans(sim);
    let settled = 2 * crate::sim::cosmos::DAY_LENGTH;
    sim.buildings
        .iter()
        .filter(|b| !b.decorative && !b.is_ruined() && !kept_in_use(b.kind))
        .filter(|b| b.owner_lineage.as_deref().is_some_and(|l| living.contains(l)))
        .filter(|b| sim.tick_count.saturating_sub(b.built_at_tick) > settled)
        .filter(|b| {
            let orphan = b.town.is_none() || fading.contains_key(&b.id);
            orphan && !(fading.contains_key(&b.id) && b.damage_fraction() > 0.0)
        })
        .map(|b| (b.kind, b.x, b.y))
        .collect()
}

pub(crate) fn way_blocks(kind: BuildingKind, road: u8) -> bool {
    match road {
        ROAD_NONE => false,
        ROAD_RAIL => true,
        ROAD_TRACK if matches!(kind, BuildingKind::Gate | BuildingKind::Fountain) => false,
        ROAD_TRACK | ROAD_BRIDGE if kind == BuildingKind::Bridge => false,
        _ => true,
    }
}

pub fn network_strays(sim: &Simulation) -> NetworkStrays {
    let living = living_lineages(sim);
    let covered = covered_tiles(sim);
    let live: Vec<&RailLine> = sim
        .rail_lines
        .iter()
        .filter(|l| line_is_live(sim, l, &living, &covered))
        .collect();
    let owned = owned_cells(live.iter().copied());
    let stray_rail = sim
        .grid
        .road
        .iter()
        .enumerate()
        .filter(|&(i, &r)| r == ROAD_RAIL && !owned.contains(&i))
        .count();
    let ends: Vec<[i32; 2]> = live.iter().flat_map(|l| [l.a, l.b]).collect();
    let powered = powered_lineages(sim);
    let standing = |kind: BuildingKind| {
        sim.buildings
            .iter()
            .filter(move |b| !b.decorative && !b.is_ruined() && b.kind == kind)
    };
    let stations_without_line = standing(BuildingKind::TrainStation)
        .filter(|b| !near_a_line_end(stop_of(b), &ends))
        .count();
    let substations_without_grid = standing(BuildingKind::Substation)
        .filter(|b| unpowered(b, &powered))
        .count();
    let under: FxHashSet<(i32, i32)> = sim
        .buildings
        .iter()
        .filter(|b| {
            !matches!(
                b.kind,
                BuildingKind::Gate | BuildingKind::Bridge | BuildingKind::Fountain
            )
        })
        .flat_map(footprint_tiles)
        .filter(|&(x, y)| {
            WorldGrid::in_bounds(x, y)
                && matches!(sim.grid.road_at(x, y), ROAD_TRACK | ROAD_BRIDGE | ROAD_RAIL)
        })
        .collect();
    NetworkStrays {
        stray_rail,
        stations_without_line,
        substations_without_grid,
        ways_under_buildings: under.len(),
    }
}

impl Simulation {
    pub(crate) fn tend_rail(&mut self) {
        self.retire_dead_lines();
        self.mend_lines();
        self.decay_stray_rail();
    }

    fn retire_dead_lines(&mut self) {
        if self.rail_lines.is_empty() {
            return;
        }
        let dead: Vec<(u32, String)> = {
            let living = living_lineages(self);
            let covered = covered_tiles(self);
            self.rail_lines
                .iter()
                .filter(|l| !line_is_live(self, l, &living, &covered))
                .map(|l| (l.id, l.lineage.clone()))
                .collect()
        };
        if dead.is_empty() {
            return;
        }
        let gone = |id: u32| dead.iter().any(|(d, _)| *d == id);
        self.rail_lines.retain(|l| !gone(l.id));
        self.vehicles
            .retain(|v| !(v.kind == TransportKind::Train && v.rail_line.is_some_and(gone)));
        let now = self.tick_count;
        for (_, owner) in &dead {
            let name = self
                .lineage_names
                .get(owner)
                .cloned()
                .unwrap_or_else(|| owner.clone());
            push_event(
                &mut self.events,
                now,
                "build",
                &name,
                "closed a railway that no longer joins two towns, and its track is left to the weeds",
            );
        }
    }

    fn mend_lines(&mut self) {
        let gaps: Vec<usize> = self
            .rail_lines
            .iter()
            .flat_map(rail_cells)
            .filter(|&[x, y]| {
                WorldGrid::in_bounds(x, y)
                    && self.grid.get(x, y).road_ground()
                    && matches!(self.grid.road_at(x, y), ROAD_NONE | ROAD_TRACK)
            })
            .map(|[x, y]| WorldGrid::idx(x, y))
            .collect();
        for i in gaps {
            self.grid.road[i] = ROAD_RAIL;
        }
    }

    fn decay_stray_rail(&mut self) {
        let owned = owned_cells(self.rail_lines.iter());
        let mut remnants: BTreeMap<usize, u8> = std::mem::take(&mut self.rail_remnants)
            .into_iter()
            .filter(|r| WorldGrid::in_bounds(r.at[0], r.at[1]))
            .map(|r| (WorldGrid::idx(r.at[0], r.at[1]), r.days.saturating_add(1)))
            .collect();
        for (i, &road) in self.grid.road.iter().enumerate() {
            if road == ROAD_RAIL && !owned.contains(&i) {
                remnants.entry(i).or_insert(0);
            }
        }
        let mut kept = Vec::with_capacity(remnants.len());
        for (i, days) in remnants {
            let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            match self.grid.road[i] {
                ROAD_RAIL if owned.contains(&i) => continue,
                ROAD_RAIL if days >= RAIL_TO_TRACK_DAYS => self.grid.road[i] = ROAD_TRACK,
                ROAD_RAIL => {}
                ROAD_TRACK if days >= REMNANT_GONE_DAYS => {
                    let trodden = self.grid.trail_at(x, y, TrailKind::Path) >= BUSY_TRAIL;
                    if !trodden && !town_reserved(self, x, y) {
                        self.grid.road[i] = ROAD_NONE;
                    }
                    continue;
                }
                ROAD_TRACK => {}
                _ => continue,
            }
            kept.push(RailRemnant { at: [x, y], days });
        }
        self.rail_remnants = kept;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::storage::persistence::SaveState;
    use crate::world::tiles::Tile;

    fn grassland() -> Simulation {
        let mut sim = Simulation::new(0x5_7A7);
        sim.buildings.clear();
        sim.rail_lines.clear();
        for y in 40..=60 {
            for x in 40..=60 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim
    }

    fn standing(sim: &mut Simulation, kind: BuildingKind, x: i32, y: i32, owner: &str) -> u32 {
        let id = sim.next_building_id;
        sim.next_building_id += 1;
        let mut b = Building::new(id, kind, x, y, Some(owner.to_string()), 0);
        b.condition = 1.0;
        sim.buildings.push(b);
        id
    }

    #[test]
    fn scenery_far_from_any_town_fades_while_town_scenery_stays() {
        let mut sim = grassland();
        let owner = sim.organisms[0].lineage_id.clone();
        sim.towns.push(crate::sim::civ::civ_tick::town::Town {
            id: 1,
            lineage: owner.clone(),
            center: [50, 50],
            streets: Vec::new(),
            founded_tick: 0,
            planned: false,
            growth: 0,
        });
        let kept = standing(&mut sim, BuildingKind::Bench, 52, 50, &owner);
        let stray = standing(&mut sim, BuildingKind::Bench, 80, 80, &owner);
        let site = standing(&mut sim, BuildingKind::Castle, 120, 120, &owner);
        for b in sim.buildings.iter_mut() {
            b.decorative = b.kind == BuildingKind::Bench;
            b.town = (b.id == kept).then_some(1);
        }
        sim.buildings.iter_mut().find(|b| b.id == site).unwrap().condition = 0.2;
        for day in 1..=45u64 {
            sim.tick_count = day * crate::sim::cosmos::DAY_LENGTH;
            crate::sim::civ::vacancy::tick_vacancy(&mut sim);
        }
        assert!(sim.buildings.iter().any(|b| b.id == kept), "town scenery stays");
        assert!(
            !sim.buildings.iter().any(|b| b.id == stray),
            "a stray prop crumbles away"
        );
        assert!(
            !sim.buildings.iter().any(|b| b.id == site),
            "an abandoned far site is cleared"
        );
    }

    #[test]
    fn a_seeded_world_has_no_unowned_infrastructure() {
        for seed in [3, 9] {
            let mut sim = Simulation::new(seed);
            while sim.tick_count < 6_000 {
                sim.tick();
            }
            let unowned = unowned_infrastructure(&sim);
            assert!(unowned.is_empty(), "seed {seed}: {unowned:?}");
            assert_eq!(network_strays(&sim).stray_rail, 0, "seed {seed}");
        }
    }

    #[test]
    fn a_substation_is_an_orphan_until_its_tribe_has_a_power_source() {
        let mut sim = grassland();
        let owner = sim.organisms[0].lineage_id.clone();
        let sub = standing(&mut sim, BuildingKind::Substation, 42, 42, &owner);
        assert!(orphaned_infrastructure(&sim).contains(&sub));
        assert_eq!(network_strays(&sim).substations_without_grid, 1);
        standing(&mut sim, BuildingKind::PowerPlant, 50, 50, &owner);
        assert!(!orphaned_infrastructure(&sim).contains(&sub));
        assert_eq!(network_strays(&sim).substations_without_grid, 0);
    }

    #[test]
    fn stray_rail_is_counted_turns_to_a_bed_and_is_saved_while_it_fades() {
        let mut sim = grassland();
        for x in 44..=49 {
            sim.grid.road[WorldGrid::idx(x, 50)] = ROAD_RAIL;
        }
        assert_eq!(network_strays(&sim).stray_rail, 6);
        sim.tend_rail();
        assert_eq!(sim.rail_remnants.len(), 6);
        sim.tend_rail();
        assert_eq!(network_strays(&sim).stray_rail, 0);
        assert_eq!(sim.grid.road_at(46, 50), ROAD_TRACK);
        let json = serde_json::to_string(&sim.to_save_state()).expect("save state serialises");
        let loaded: SaveState = serde_json::from_str(&json).expect("save state parses");
        let mut back = Simulation::from_save(0x5_7A7, loaded);
        assert_eq!(back.rail_remnants, sim.rail_remnants);
        for _ in 0..3 {
            back.tend_rail();
        }
        assert_eq!(back.grid.road_at(46, 50), ROAD_NONE);
        assert!(back.rail_remnants.is_empty());
    }

    #[test]
    fn a_save_without_rail_remnants_loads_with_none() {
        let sim = grassland();
        let mut value = serde_json::to_value(sim.to_save_state()).expect("save state as a value");
        value.as_object_mut().expect("object").remove("rail_remnants");
        let loaded: SaveState = serde_json::from_value(value).expect("an old save parses");
        assert!(Simulation::from_save(0x5_7A7, loaded).rail_remnants.is_empty());
    }

    #[test]
    fn buildings_on_ways_are_counted_but_gates_and_fountains_are_not() {
        let mut sim = grassland();
        let owner = sim.organisms[0].lineage_id.clone();
        for x in 40..=60 {
            sim.grid.road[WorldGrid::idx(x, 45)] = ROAD_TRACK;
        }
        standing(&mut sim, BuildingKind::Hut, 42, 45, &owner);
        standing(&mut sim, BuildingKind::Gate, 50, 45, &owner);
        standing(&mut sim, BuildingKind::Fountain, 55, 45, &owner);
        assert_eq!(network_strays(&sim).ways_under_buildings, 1);
    }
}
