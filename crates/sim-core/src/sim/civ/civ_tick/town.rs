//! Town layout. A settlement of tier 2 or more (a hamlet and up, see
//! `settlements::TIER_NAMES`) keeps a central plaza of paved tiles, four
//! streets that run out from it along the axes, civic buildings in the corners
//! between the streets, and homes built along the streets.
//!
//! The plaza and streets are road tiles (`grid.road`), so they are paved and
//! walked like any road and persist with the world. The plaza and streets
//! themselves are reserved for automatic placement: no home or civic building
//! is started on them, so a town keeps its open square and its lanes.

use serde::{Deserialize, Serialize};

use super::*;
use crate::world::grid::{WorldGrid, ROAD_TRACK};

/// The lowest settlement tier that lays out a town (tier 2, a hamlet).
pub(super) const TOWN_TIER: u8 = 2;
/// The plaza is a square of `2 * PLAZA_RADIUS + 1` tiles on a side, centred on its centre tile.
const PLAZA_RADIUS: i32 = 1;
/// Distance from the plaza centre to the first tile of a street.
const STREET_START: i32 = PLAZA_RADIUS + 1;
/// Most tiles one street runs for, counted from the plaza outwards.
const STREET_LENGTH: i32 = 9;
/// Distance from the plaza centre to the nearest edge of a civic corner building.
const CORNER_DISTANCE: i32 = STREET_START + 1;
/// The homes a town builds along its streets.
const HOME_KINDS: [BuildingKind; 5] = [
    BuildingKind::Hut,
    BuildingKind::House,
    BuildingKind::Manor,
    BuildingKind::TownHouse,
    BuildingKind::Apartment,
];
/// The civic buildings a town builds in the corners round its plaza.
const CIVIC_KINDS: [BuildingKind; 7] = [
    BuildingKind::Market,
    BuildingKind::Temple,
    BuildingKind::Tavern,
    BuildingKind::CityHall,
    BuildingKind::GuildHall,
    BuildingKind::Courthouse,
    BuildingKind::Cathedral,
];
/// Unit steps from the plaza centre along the four streets: east, south, west, north.
const ARMS: [(i32, i32); 4] = [(1, 0), (0, 1), (-1, 0), (0, -1)];

/// The town of one lineage: where its plaza is and which tiles its streets run over.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TownPlaza {
    pub lineage: String,
    /// Centre tile of the plaza.
    pub center: [i32; 2],
    /// Street tiles in arm order (east, south, west, north), nearest the plaza first.
    #[serde(default)]
    pub streets: Vec<[i32; 2]>,
}

impl TownPlaza {
    fn on_plaza(&self, x: i32, y: i32) -> bool {
        (x - self.center[0]).abs() <= PLAZA_RADIUS && (y - self.center[1]).abs() <= PLAZA_RADIUS
    }

    pub(super) fn reserves(&self, x: i32, y: i32) -> bool {
        self.on_plaza(x, y) || self.streets.contains(&[x, y])
    }

    /// Every tile the plaza and its streets hold.
    pub(super) fn reserved_tiles(&self) -> Vec<(i32, i32)> {
        let [cx, cy] = self.center;
        let mut tiles: Vec<(i32, i32)> = (-PLAZA_RADIUS..=PLAZA_RADIUS)
            .flat_map(|dy| (-PLAZA_RADIUS..=PLAZA_RADIUS).map(move |dx| (cx + dx, cy + dy)))
            .collect();
        tiles.extend(self.streets.iter().map(|&[x, y]| (x, y)));
        tiles
    }
}

/// Whether a tile is the plaza or a street of any town. Automatic placement
/// keeps buildings off these tiles.
pub(super) fn town_reserved(sim: &Simulation, x: i32, y: i32) -> bool {
    sim.town_plazas.iter().any(|town| town.reserves(x, y))
}

/// Every tile a standing or reserved non-decorative building covers.
fn built_tiles(sim: &Simulation) -> HashSet<(i32, i32)> {
    let mut covered = HashSet::default();
    for building in sim.buildings.iter().filter(|b| !b.decorative) {
        let (width, height) = building.footprint();
        for dy in 0..i32::from(height) {
            for dx in 0..i32::from(width) {
                covered.insert((building.x + dx, building.y + dy));
            }
        }
    }
    covered
}

/// Founds a plaza for each living lineage that has reached a town tier and does
/// not have one yet, then lays its streets. Lineages are taken in name order so
/// the layout does not depend on hash order. A plaza whose lineage has died out
/// is dropped from the record (its paving stays on the map as ruins do).
pub(crate) fn tick_town_plazas(sim: &mut Simulation) {
    let living: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    sim.town_plazas.retain(|town| living.contains(&town.lineage));
    let mut towns: Vec<String> = living
        .iter()
        .filter(|lid| sim.settlement_tiers.get(*lid).copied().unwrap_or(0) >= TOWN_TIER)
        .filter(|lid| !sim.town_plazas.iter().any(|town| town.lineage == **lid))
        .cloned()
        .collect();
    if towns.is_empty() {
        return;
    }
    towns.sort();
    let covered = built_tiles(sim);
    for lid in towns {
        let (cx, cy) = lineage_center(sim, &lid);
        if (cx, cy) == (0, 0) {
            continue;
        }
        let Some(center) = find_plaza_site(sim, &covered, cx, cy) else {
            continue;
        };
        let streets = lay_town(sim, &covered, center);
        sim.town_plazas.push(TownPlaza {
            lineage: lid,
            center,
            streets,
        });
    }
}

/// The nearest centre, searching rings out from (cx, cy), where a plaza fits:
/// every tile is open ground that no building or other town holds.
fn find_plaza_site(sim: &Simulation, covered: &HashSet<(i32, i32)>, cx: i32, cy: i32) -> Option<[i32; 2]> {
    for radius in 0..=SITE_SEARCH_RADIUS {
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                let center = [cx + dx, cy + dy];
                if plaza_fits(sim, covered, center) {
                    return Some(center);
                }
            }
        }
    }
    None
}

fn plaza_fits(sim: &Simulation, covered: &HashSet<(i32, i32)>, center: [i32; 2]) -> bool {
    (-PLAZA_RADIUS..=PLAZA_RADIUS).all(|dy| {
        (-PLAZA_RADIUS..=PLAZA_RADIUS).all(|dx| {
            let (x, y) = (center[0] + dx, center[1] + dy);
            WorldGrid::in_bounds(x, y)
                && sim.grid.get(x, y).road_ground()
                && !covered.contains(&(x, y))
                && !town_reserved(sim, x, y)
        })
    })
}

/// Paves the plaza and runs a street out along each arm until it meets open
/// ground that is not free. Returns the street tiles, arm by arm.
fn lay_town(sim: &mut Simulation, covered: &HashSet<(i32, i32)>, center: [i32; 2]) -> Vec<[i32; 2]> {
    let [cx, cy] = center;
    for dy in -PLAZA_RADIUS..=PLAZA_RADIUS {
        for dx in -PLAZA_RADIUS..=PLAZA_RADIUS {
            sim.grid.road[WorldGrid::idx(cx + dx, cy + dy)] = ROAD_TRACK;
        }
    }
    let mut streets = Vec::new();
    for (ux, uy) in ARMS {
        for step in STREET_START..STREET_START + STREET_LENGTH {
            let (x, y) = (cx + ux * step, cy + uy * step);
            if !WorldGrid::in_bounds(x, y)
                || !sim.grid.get(x, y).road_ground()
                || covered.contains(&(x, y))
                || town_reserved(sim, x, y)
            {
                break;
            }
            sim.grid.road[WorldGrid::idx(x, y)] = ROAD_TRACK;
            streets.push([x, y]);
        }
    }
    streets
}

/// The count of a lineage's standing or reserved buildings of the given kinds.
fn owned_count(sim: &Simulation, lineage: &str, kinds: &[BuildingKind]) -> usize {
    sim.buildings
        .iter()
        .filter(|b| !b.decorative && b.owner_lineage.as_deref() == Some(lineage) && kinds.contains(&b.kind))
        .count()
}

/// Where automatic placement starts for a building of `kind` in a lineage's
/// town, or `None` when the town does not place that kind. Homes take the
/// frontage of the streets, one side of a street tile at a time, in order;
/// civic buildings take the corners of the plaza, one corner at a time.
pub(super) fn town_anchor(sim: &Simulation, lineage: &str, kind: BuildingKind) -> Option<(i32, i32)> {
    let town = sim.town_plazas.iter().find(|town| town.lineage == lineage)?;
    let (width, height) = kind.footprint();
    let (width, height) = (i32::from(width), i32::from(height));
    if HOME_KINDS.contains(&kind) {
        if town.streets.is_empty() {
            return None;
        }
        let homes = owned_count(sim, lineage, &HOME_KINDS);
        let slot = homes % (town.streets.len() * 2);
        let [x, y] = town.streets[slot / 2];
        let anchor = if y == town.center[1] {
            // A street running east and west: homes stand on its south or north side.
            if slot.is_multiple_of(2) {
                (x, y + 1)
            } else {
                (x, y - height)
            }
        } else if slot.is_multiple_of(2) {
            // A street running north and south: homes stand on its east or west side.
            (x + 1, y)
        } else {
            (x - width, y)
        };
        Some(anchor)
    } else if CIVIC_KINDS.contains(&kind) {
        let corner = owned_count(sim, lineage, &CIVIC_KINDS) % 4;
        let [cx, cy] = town.center;
        let x = if corner & 1 == 0 {
            cx + CORNER_DISTANCE
        } else {
            cx - CORNER_DISTANCE - (width - 1)
        };
        let y = if corner & 2 == 0 {
            cy - CORNER_DISTANCE - (height - 1)
        } else {
            cy + CORNER_DISTANCE
        };
        Some((x, y))
    } else {
        None
    }
}

/// The point automatic placement searches from for `kind`: the town's frontage
/// or corner when the lineage has a town and the kind is one it places,
/// otherwise the lineage centre plus `offset`.
pub(super) fn placement_point(
    sim: &Simulation,
    lineage: &str,
    kind: BuildingKind,
    center: (i32, i32),
    offset: (i32, i32),
) -> (i32, i32) {
    town_anchor(sim, lineage, kind).unwrap_or((center.0 + offset.0, center.1 + offset.1))
}

/// The era a town raises its market in, and the population it needs first.
const MARKET_ERA: Era = Era::Bronze;
const MARKET_POPULATION: usize = 8;

/// True when a town of this lineage has no market yet and has the people and
/// the era for one. Its market then goes on the plaza before more homes.
pub(super) fn town_market_wanted(sim: &Simulation, lineage: &str, era: Era, pop: usize) -> bool {
    era >= MARKET_ERA
        && pop >= construction_population_requirement(MARKET_POPULATION, sim.population_limit())
        && sim.town_plazas.iter().any(|town| town.lineage == lineage)
        && owned_count(sim, lineage, &[BuildingKind::Market]) == 0
}

/// True when a town wants its market and can pay for it now.
pub(super) fn town_market_due(sim: &Simulation, lineage: &str, era: Era, pop: usize) -> bool {
    town_market_wanted(sim, lineage, era, pop)
        && construction_cost_available(sim, lineage, BuildingKind::Market)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::{organism::Organism, traits::Traits};
    use crate::sim::storage::persistence::SaveState;
    use crate::world::grid::ROAD_NONE;
    use crate::world::tiles::Tile;

    /// A grassy site with a clan of `people` clustered near (50, 50), at settlement tier `tier`.
    fn clan_sim(people: usize, tier: u8) -> Simulation {
        let mut sim = Simulation::new(0x70_4E);
        sim.organisms.clear();
        sim.buildings.clear();
        for y in 30..=70 {
            for x in 30..=70 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for id in 0..people {
            let mut org = Organism::new(
                format!("clan-{id}"),
                "Clansman".into(),
                48.0 + (id % 5) as f32,
                48.0 + (id / 5) as f32,
                0,
                String::new(),
                "clan".into(),
                20_000,
                Traits::default(),
            );
            org.alive = true;
            org.age = 10_000;
            org.energy = 0.8;
            org.inv_wood = 40;
            org.inv_stone = 40;
            org.wealth = 20;
            sim.organisms.push(org);
        }
        sim.settlement_tiers.insert("clan".into(), tier);
        sim.lineage_eras.insert("clan".into(), Era::Stone);
        sim
    }

    fn in_plaza(town: &TownPlaza, x: i32, y: i32) -> bool {
        (x - town.center[0]).abs() <= PLAZA_RADIUS && (y - town.center[1]).abs() <= PLAZA_RADIUS
    }

    #[test]
    fn a_hamlet_paves_a_plaza_with_four_streets_round_its_centre() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_town_plazas(&mut sim);
        assert_eq!(sim.town_plazas.len(), 1, "one plaza for the clan");
        let town = sim.town_plazas[0].clone();
        for dy in -PLAZA_RADIUS..=PLAZA_RADIUS {
            for dx in -PLAZA_RADIUS..=PLAZA_RADIUS {
                let (x, y) = (town.center[0] + dx, town.center[1] + dy);
                assert_eq!(sim.grid.road_at(x, y), ROAD_TRACK, "plaza tile {x},{y} is paved");
            }
        }
        assert_eq!(
            town.streets.len(),
            4 * STREET_LENGTH as usize,
            "every arm runs its full length"
        );
        for &[x, y] in &town.streets {
            assert_eq!(sim.grid.road_at(x, y), ROAD_TRACK, "street tile {x},{y} is paved");
            assert!(!in_plaza(&town, x, y));
        }
        // Founding again changes nothing: a lineage gets one plaza.
        tick_town_plazas(&mut sim);
        assert_eq!(sim.town_plazas.len(), 1);
    }

    #[test]
    fn a_camp_does_not_lay_out_a_town() {
        let mut sim = clan_sim(12, TOWN_TIER - 1);
        tick_town_plazas(&mut sim);
        assert!(sim.town_plazas.is_empty());
    }

    #[test]
    fn homes_stand_along_the_streets_and_keep_off_the_plaza() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_town_plazas(&mut sim);
        for _ in 0..60 {
            tick_buildings_construct(&mut sim);
            // Workers finish each project between passes, so the next pass can start another.
            for building in sim.buildings.iter_mut() {
                building.condition = 1.0;
            }
        }
        let town = sim.town_plazas[0].clone();
        let homes: Vec<Building> = sim
            .buildings
            .iter()
            .filter(|b| HOME_KINDS.contains(&b.kind))
            .cloned()
            .collect();
        assert!(homes.len() >= 3, "the clan builds homes, {} stand", homes.len());
        let mut on_street = 0;
        for home in &homes {
            let (w, h) = home.footprint();
            for y in home.y..home.y + i32::from(h) {
                for x in home.x..home.x + i32::from(w) {
                    assert!(!in_plaza(&town, x, y), "a home covers the plaza at {x},{y}");
                    assert!(
                        !town.streets.contains(&[x, y]),
                        "a home covers a street at {x},{y}"
                    );
                }
            }
            let beside_street = (home.x - 1..=home.x + i32::from(w))
                .flat_map(|x| (home.y - 1..=home.y + i32::from(h)).map(move |y| (x, y)))
                .any(|(x, y)| town.streets.contains(&[x, y]));
            if beside_street {
                on_street += 1;
            }
        }
        assert!(
            on_street * 2 >= homes.len(),
            "most homes front a street: {on_street} of {}",
            homes.len()
        );
    }

    #[test]
    fn civic_buildings_take_the_corners_of_the_plaza() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_town_plazas(&mut sim);
        let town = sim.town_plazas[0].clone();
        let [cx, cy] = town.center;
        let (w, h) = BuildingKind::Temple.footprint();
        let mut corners = Vec::new();
        for k in 0..4 {
            let (x, y) = town_anchor(&sim, "clan", BuildingKind::Temple).expect("a temple has a place");
            for ty in y..y + i32::from(h) {
                for tx in x..x + i32::from(w) {
                    assert!(
                        !in_plaza(&town, tx, ty),
                        "a corner building covers the plaza at {tx},{ty}"
                    );
                    assert!(
                        tx != cx && ty != cy,
                        "a corner building covers a street at {tx},{ty}"
                    );
                }
            }
            corners.push((x, y));
            sim.buildings.push(Building::new(
                k + 1,
                BuildingKind::Temple,
                x,
                y,
                Some("clan".into()),
                0,
            ));
        }
        let distinct: HashSet<(i32, i32)> = corners.iter().copied().collect();
        assert_eq!(distinct.len(), 4, "four corners, four sites: {corners:?}");
    }

    #[test]
    fn automatic_sites_never_cover_the_plaza_or_a_street() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_town_plazas(&mut sim);
        let town = sim.town_plazas[0].clone();
        let [cx, cy] = town.center;
        for (x, y) in [(cx, cy), (cx + 2, cy), (cx + 3, cy - 3)] {
            if let Some((sx, sy)) = find_construction_site(&sim, "clan", BuildingKind::Hut, x, y) {
                assert!(
                    !in_plaza(&town, sx, sy),
                    "a hut site lands on the plaza at {sx},{sy}"
                );
                assert!(!town.streets.contains(&[sx, sy]), "a hut site lands on a street");
            }
        }
    }

    #[test]
    fn a_town_survives_a_save_and_load() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_town_plazas(&mut sim);
        let json = serde_json::to_string(&sim.to_save_state()).expect("save state serialises");
        let loaded: SaveState = serde_json::from_str(&json).expect("save state parses");
        let back = Simulation::from_save(0x70_4E, loaded);
        assert_eq!(back.town_plazas, sim.town_plazas);
    }

    #[test]
    fn a_save_without_towns_loads_with_none() {
        let sim = clan_sim(4, 0);
        let mut value = serde_json::to_value(sim.to_save_state()).expect("save state as a value");
        value.as_object_mut().expect("object").remove("town_plazas");
        let loaded: SaveState = serde_json::from_value(value).expect("an old save parses");
        let back = Simulation::from_save(0x70_4E, loaded);
        assert!(back.town_plazas.is_empty());
    }

    #[test]
    fn a_lineage_that_dies_out_loses_its_plaza_record() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_town_plazas(&mut sim);
        let center = sim.town_plazas[0].center;
        for org in sim.organisms.iter_mut() {
            org.alive = false;
        }
        tick_town_plazas(&mut sim);
        assert!(sim.town_plazas.is_empty());
        assert_eq!(
            sim.grid.road_at(center[0], center[1]),
            ROAD_TRACK,
            "the paving stays on the map"
        );
        assert_ne!(sim.grid.road_at(center[0], center[1]), ROAD_NONE);
    }
}
