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
use crate::world::grid::{WorldGrid, ROAD_NONE, ROAD_TRACK};

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
const HOME_KINDS: [BuildingKind; 6] = [
    BuildingKind::Hut,
    BuildingKind::House,
    BuildingKind::Longhouse,
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

const MAX_TOWNS: usize = 3;
const FIRST_TOWN_PEOPLE: usize = 1;
const NEW_TOWN_PEOPLE: usize = 10;
const TOWN_SPACING: i32 = 28;
const CLUSTER_CELL: i32 = 12;
const PLAN_PEOPLE: usize = 8;
const ABANDON_REACH: i32 = 30;
pub(crate) const PARENT_REACH: i32 = 30;
const HOME_REACH: i32 = 16;
const HOME_WEIGHT: usize = 3;
const CROSS_STREETS: [(usize, i32); 2] = [(20, 5), (40, 9)];
const CROSS_LENGTH: i32 = 5;

type HomesByLineage = std::collections::BTreeMap<String, Vec<[i32; 2]>>;

fn planned_by_default() -> bool {
    true
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Town {
    #[serde(default)]
    pub id: u32,
    pub lineage: String,
    pub center: [i32; 2],
    #[serde(default)]
    pub streets: Vec<[i32; 2]>,
    #[serde(default)]
    pub founded_tick: u64,
    #[serde(default = "planned_by_default")]
    pub planned: bool,
    #[serde(default)]
    pub growth: u8,
}

impl Town {
    fn on_plaza(&self, x: i32, y: i32) -> bool {
        (x - self.center[0]).abs() <= PLAZA_RADIUS && (y - self.center[1]).abs() <= PLAZA_RADIUS
    }

    pub(super) fn reserves(&self, x: i32, y: i32) -> bool {
        self.on_plaza(x, y) || self.streets.contains(&[x, y])
    }

    pub(crate) fn reserved_tiles(&self) -> Vec<(i32, i32)> {
        let [cx, cy] = self.center;
        let mut tiles: Vec<(i32, i32)> = (-PLAZA_RADIUS..=PLAZA_RADIUS)
            .flat_map(|dy| (-PLAZA_RADIUS..=PLAZA_RADIUS).map(move |dx| (cx + dx, cy + dy)))
            .collect();
        tiles.extend(self.streets.iter().map(|&[x, y]| (x, y)));
        tiles
    }

    pub(crate) fn distance(&self, x: i32, y: i32) -> i32 {
        (x - self.center[0]).abs().max((y - self.center[1]).abs())
    }
}

pub(crate) fn town_reserved(sim: &Simulation, x: i32, y: i32) -> bool {
    sim.towns.iter().any(|town| town.reserves(x, y))
}

fn reserved_by_other(sim: &Simulation, x: i32, y: i32, id: u32) -> bool {
    sim.towns.iter().any(|town| town.id != id && town.reserves(x, y))
}

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

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

fn homes_by_lineage(sim: &Simulation) -> HomesByLineage {
    let mut out = HomesByLineage::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        out.entry(o.lineage_id.clone())
            .or_default()
            .push([o.home_x as i32, o.home_y as i32]);
    }
    out
}

fn settled_points(sim: &Simulation, homes: &HomesByLineage) -> HomesByLineage {
    let mut out = homes.clone();
    for b in sim
        .buildings
        .iter()
        .filter(|b| !b.decorative && !b.is_ruined() && crate::sim::civ::vacancy::is_home(b.kind))
    {
        if let Some(points) = b.owner_lineage.as_ref().and_then(|l| out.get_mut(l)) {
            points.extend(std::iter::repeat_n([b.x, b.y], HOME_WEIGHT));
        }
    }
    out
}

fn clusters(homes: &[[i32; 2]]) -> Vec<(usize, [i32; 2])> {
    let mut cells: std::collections::BTreeMap<(i32, i32), (usize, i64, i64)> =
        std::collections::BTreeMap::new();
    for &[x, y] in homes {
        let cell = cells
            .entry((x.div_euclid(CLUSTER_CELL), y.div_euclid(CLUSTER_CELL)))
            .or_insert((0, 0, 0));
        cell.0 += 1;
        cell.1 += i64::from(x);
        cell.2 += i64::from(y);
    }
    let mut seen: HashSet<(i32, i32)> = HashSet::default();
    let mut out = Vec::new();
    for &start in cells.keys() {
        if !seen.insert(start) {
            continue;
        }
        let (mut n, mut sx, mut sy) = (0usize, 0i64, 0i64);
        let mut stack = vec![start];
        while let Some((cx, cy)) = stack.pop() {
            let (c, x, y) = cells[&(cx, cy)];
            n += c;
            sx += x;
            sy += y;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    let next = (cx + dx, cy + dy);
                    if cells.contains_key(&next) && seen.insert(next) {
                        stack.push(next);
                    }
                }
            }
        }
        out.push((n, [(sx / n as i64) as i32, (sy / n as i64) as i32]));
    }
    out.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    out
}

fn residents(sim: &Simulation, homes: &HomesByLineage) -> HashMap<u32, usize> {
    let mut out: HashMap<u32, usize> = HashMap::default();
    for (lineage, list) in homes {
        let towns: Vec<&Town> = sim.towns.iter().filter(|t| &t.lineage == lineage).collect();
        if towns.is_empty() {
            continue;
        }
        for &home in list {
            if let Some(t) = towns
                .iter()
                .filter(|t| chebyshev(t.center, home) <= ABANDON_REACH)
                .min_by_key(|t| (chebyshev(t.center, home), t.id))
            {
                *out.entry(t.id).or_insert(0) += 1;
            }
        }
    }
    out
}

pub(crate) fn tick_towns(sim: &mut Simulation) {
    let homes = homes_by_lineage(sim);
    let people = residents(sim, &homes);
    let standing: HashSet<u32> = sim
        .buildings
        .iter()
        .filter(|b| !b.decorative && !b.is_ruined())
        .filter_map(|b| b.town)
        .collect();
    let (kept, dropped): (Vec<Town>, Vec<Town>) =
        std::mem::take(&mut sim.towns).into_iter().partition(|town| {
            homes.contains_key(&town.lineage)
                && (people.get(&town.id).copied().unwrap_or(0) > 0 || standing.contains(&town.id))
        });
    sim.towns = kept;
    let paving: Vec<[i32; 2]> = dropped
        .iter()
        .flat_map(|t| t.reserved_tiles())
        .map(|(x, y)| [x, y])
        .collect();
    crate::sim::civ::land::road_net::wear_cells(sim, &paving);
    found_towns(sim, &homes);
    let people = residents(sim, &homes);
    plan_towns(sim, &people);
    grow_towns(sim, &people);
    assign_parents(sim);
}

fn found_towns(sim: &mut Simulation, homes: &HomesByLineage) {
    let homes = &settled_points(sim, homes);
    let covered = built_tiles(sim);
    let mut founded: Vec<(String, [i32; 2])> = Vec::new();
    for (lineage, list) in homes {
        let mut centres: Vec<[i32; 2]> = sim
            .towns
            .iter()
            .filter(|t| &t.lineage == lineage)
            .map(|t| t.center)
            .collect();
        if centres.len() >= MAX_TOWNS {
            continue;
        }
        for (count, at) in clusters(list) {
            if centres.len() >= MAX_TOWNS {
                break;
            }
            let need = if centres.is_empty() {
                FIRST_TOWN_PEOPLE
            } else {
                NEW_TOWN_PEOPLE
            };
            if count < need || centres.iter().any(|&c| chebyshev(c, at) <= TOWN_SPACING) {
                continue;
            }
            let centre = find_plaza_site(sim, &covered, at[0], at[1], 0).unwrap_or(at);
            centres.push(centre);
            founded.push((lineage.clone(), centre));
        }
    }
    let now = sim.tick_count;
    for (lineage, center) in founded {
        let id = sim.next_town_id.max(1);
        sim.next_town_id = id + 1;
        sim.towns.push(Town {
            id,
            lineage,
            center,
            streets: Vec::new(),
            founded_tick: now,
            planned: false,
            growth: 0,
        });
    }
}

fn plan_towns(sim: &mut Simulation, people: &HashMap<u32, usize>) {
    for i in 0..sim.towns.len() {
        let town = &sim.towns[i];
        if town.planned || sim.settlement_tiers.get(&town.lineage).copied().unwrap_or(0) < TOWN_TIER {
            continue;
        }
        let first = !sim.towns.iter().any(|t| t.planned && t.lineage == town.lineage);
        if !first && people.get(&town.id).copied().unwrap_or(0) < PLAN_PEOPLE {
            continue;
        }
        let (id, [cx, cy]) = (town.id, town.center);
        let covered = built_tiles(sim);
        let Some(center) = find_plaza_site(sim, &covered, cx, cy, id) else {
            continue;
        };
        sim.towns[i].center = center;
        let streets = lay_town(sim, &covered, center, id);
        sim.towns[i].streets = streets;
        sim.towns[i].planned = true;
        let paved: HashSet<(i32, i32)> = sim.towns[i].reserved_tiles().into_iter().collect();
        sim.buildings.retain(|b| {
            let (w, h) = b.footprint();
            !b.decorative
                || !(b.y..b.y + i32::from(h))
                    .any(|y| (b.x..b.x + i32::from(w)).any(|x| paved.contains(&(x, y))))
        });
    }
}

fn grow_towns(sim: &mut Simulation, people: &HashMap<u32, usize>) {
    for i in 0..sim.towns.len() {
        let town = &sim.towns[i];
        let Some(&(need, step)) = CROSS_STREETS.get(usize::from(town.growth)) else {
            continue;
        };
        if !town.planned || people.get(&town.id).copied().unwrap_or(0) < need {
            continue;
        }
        let (id, [cx, cy]) = (town.id, town.center);
        let covered = built_tiles(sim);
        let mut added = Vec::new();
        for (ux, uy) in ARMS {
            let root = [cx + ux * step, cy + uy * step];
            if !sim.towns[i].streets.contains(&root) {
                continue;
            }
            for (px, py) in [(-uy, ux), (uy, -ux)] {
                for k in 1..=CROSS_LENGTH {
                    let (x, y) = (root[0] + px * k, root[1] + py * k);
                    if !WorldGrid::in_bounds(x, y)
                        || !sim.grid.get(x, y).road_ground()
                        || !pavable(sim, x, y)
                        || covered.contains(&(x, y))
                        || reserved_by_other(sim, x, y, id)
                    {
                        break;
                    }
                    pave(sim, x, y);
                    added.push([x, y]);
                }
            }
        }
        sim.towns[i].streets.extend(added);
        sim.towns[i].growth += 1;
    }
}

pub(crate) fn parent_for(sim: &Simulation, lineage: &str, x: i32, y: i32) -> Option<u32> {
    sim.towns
        .iter()
        .filter(|t| t.lineage == lineage)
        .map(|t| (t.distance(x, y), t.id))
        .filter(|&(d, _)| d <= PARENT_REACH)
        .min()
        .map(|(_, id)| id)
}

pub(crate) fn assign_parents(sim: &mut Simulation) {
    let mut by_lineage: HashMap<String, Vec<(u32, [i32; 2])>> = HashMap::default();
    for t in &sim.towns {
        by_lineage
            .entry(t.lineage.clone())
            .or_default()
            .push((t.id, t.center));
    }
    let mut changed = false;
    for b in sim.buildings.iter_mut() {
        let towns = b.owner_lineage.as_ref().and_then(|l| by_lineage.get(l));
        let keep = b
            .town
            .is_some_and(|id| towns.is_some_and(|ts| ts.iter().any(|t| t.0 == id)));
        if keep {
            continue;
        }
        let parent = towns.and_then(|ts| {
            ts.iter()
                .map(|&(id, c)| (chebyshev(c, [b.x, b.y]), id))
                .filter(|&(d, _)| d <= PARENT_REACH)
                .min()
                .map(|(_, id)| id)
        });
        if b.town != parent {
            b.town = parent;
            changed = true;
        }
    }
    if changed {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
}

pub(crate) fn settle_loaded_towns(sim: &mut Simulation) {
    let old = sim.next_town_id == 0;
    let mut next = sim
        .towns
        .iter()
        .map(|t| t.id)
        .max()
        .unwrap_or(0)
        .max(sim.next_town_id.saturating_sub(1))
        + 1;
    for town in sim.towns.iter_mut().filter(|t| t.id == 0) {
        town.id = next;
        next += 1;
    }
    sim.next_town_id = next;
    if old {
        let homes = homes_by_lineage(sim);
        found_towns(sim, &homes);
        assign_parents(sim);
    }
}

fn find_plaza_site(
    sim: &Simulation,
    covered: &HashSet<(i32, i32)>,
    cx: i32,
    cy: i32,
    own: u32,
) -> Option<[i32; 2]> {
    for radius in 0..=SITE_SEARCH_RADIUS {
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                let center = [cx + dx, cy + dy];
                if plaza_fits(sim, covered, center, own) {
                    return Some(center);
                }
            }
        }
    }
    None
}

fn plaza_fits(sim: &Simulation, covered: &HashSet<(i32, i32)>, center: [i32; 2], own: u32) -> bool {
    (-PLAZA_RADIUS..=PLAZA_RADIUS).all(|dy| {
        (-PLAZA_RADIUS..=PLAZA_RADIUS).all(|dx| {
            let (x, y) = (center[0] + dx, center[1] + dy);
            WorldGrid::in_bounds(x, y)
                && sim.grid.get(x, y).road_ground()
                && pavable(sim, x, y)
                && !covered.contains(&(x, y))
                && !reserved_by_other(sim, x, y, own)
        })
    })
}

fn pavable(sim: &Simulation, x: i32, y: i32) -> bool {
    matches!(sim.grid.road_at(x, y), ROAD_NONE | ROAD_TRACK)
}

fn pave(sim: &mut Simulation, x: i32, y: i32) {
    if pavable(sim, x, y) {
        sim.grid.road[WorldGrid::idx(x, y)] = ROAD_TRACK;
    }
}

fn lay_town(
    sim: &mut Simulation,
    covered: &HashSet<(i32, i32)>,
    center: [i32; 2],
    own: u32,
) -> Vec<[i32; 2]> {
    let [cx, cy] = center;
    for dy in -PLAZA_RADIUS..=PLAZA_RADIUS {
        for dx in -PLAZA_RADIUS..=PLAZA_RADIUS {
            pave(sim, cx + dx, cy + dy);
        }
    }
    let mut streets = Vec::new();
    for (ux, uy) in ARMS {
        for step in STREET_START..STREET_START + STREET_LENGTH {
            let (x, y) = (cx + ux * step, cy + uy * step);
            if !WorldGrid::in_bounds(x, y)
                || !sim.grid.get(x, y).road_ground()
                || covered.contains(&(x, y))
                || reserved_by_other(sim, x, y, own)
            {
                break;
            }
            pave(sim, x, y);
            streets.push([x, y]);
        }
    }
    streets
}

fn owned_count(sim: &Simulation, lineage: &str, kinds: &[BuildingKind]) -> usize {
    sim.buildings
        .iter()
        .filter(|b| !b.decorative && b.owner_lineage.as_deref() == Some(lineage) && kinds.contains(&b.kind))
        .count()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Zone {
    Civic,
    Core,
    Edge,
    Free,
}

impl Zone {
    pub fn ring(self) -> Option<(i32, i32)> {
        match self {
            Zone::Civic => Some((2, 8)),
            Zone::Core => Some((2, 14)),
            Zone::Edge => Some((10, 26)),
            Zone::Free => None,
        }
    }
}

pub fn zone_of(kind: BuildingKind) -> Zone {
    use BuildingKind::*;
    if CIVIC_KINDS.contains(&kind) || kind == Fountain {
        return Zone::Civic;
    }
    if kind.needs_shore()
        || matches!(
            kind,
            Fence
                | Wall
                | Gate
                | Tower
                | Bridge
                | Aqueduct
                | Well
                | Cart
                | Signpost
                | GraveStone
                | Bench
                | Lamppost
                | StreetLight
                | TelephonePole
                | FlagPole
                | BillBoard
                | NeonSign
                | Kiosk
                | FoodCart
                | FoodTruck
                | MarketStall
                | Crosswalk
                | BusStop
                | ChargingStation
                | Drone
                | SolarPanel
                | RoboticArm
                | ArcadeBox
                | HoloBoard
                | Statue
                | TrainStation
                | Watchtower
                | Tent
                | Plaza
        )
    {
        return Zone::Free;
    }
    if matches!(kind, Forge | Smithy | Goldsmith | OfficeTower | Datacenter) {
        return Zone::Core;
    }
    if kind.function() == crate::sim::tech::buildings::BuildingFunction::Industry
        || matches!(
            kind,
            Cemetery
                | Pyramid
                | Ziggurat
                | Mausoleum
                | Coliseum
                | Stadium
                | Airport
                | Castle
                | Barracks
                | WaterTower
                | Reservoir
                | ParkingLot
                | Orchard
                | Garden
                | Pond
        )
    {
        return Zone::Edge;
    }
    Zone::Core
}

pub(crate) fn town_for(sim: &Simulation, lineage: &str, kind: BuildingKind) -> Option<usize> {
    let mine: Vec<usize> = (0..sim.towns.len())
        .filter(|&i| sim.towns[i].lineage == lineage)
        .collect();
    if mine.len() <= 1 {
        return mine.first().copied();
    }
    let homes = homes_by_lineage(sim);
    let people = residents(sim, &homes);
    let score = |i: usize| -> i64 {
        let t = &sim.towns[i];
        let residents = people.get(&t.id).copied().unwrap_or(0) as i64;
        if HOME_KINDS.contains(&kind) {
            let beds: i64 = sim
                .buildings
                .iter()
                .filter(|b| {
                    !b.decorative
                        && !b.is_ruined()
                        && b.owner_lineage.as_deref() == Some(lineage)
                        && crate::sim::civ::vacancy::is_home(b.kind)
                        && t.distance(b.x, b.y) <= HOME_REACH
                })
                .map(|b| i64::from(b.kind.capacity()))
                .sum();
            residents - beds
        } else {
            residents
        }
    };
    mine.into_iter().max_by(|&a, &b| {
        score(a)
            .cmp(&score(b))
            .then(sim.towns[b].id.cmp(&sim.towns[a].id))
    })
}

pub(crate) fn main_town<'a>(sim: &'a Simulation, lineage: &str) -> Option<&'a Town> {
    town_for(sim, lineage, BuildingKind::Market).map(|i| &sim.towns[i])
}

pub(super) fn fronts_a_street(town: &Town, x: i32, y: i32, w: i32, h: i32) -> bool {
    town.reserved_tiles().iter().any(|&(rx, ry)| {
        let beside = rx >= x - 1 && rx <= x + w && ry >= y - 1 && ry <= y + h;
        let under = rx >= x && rx < x + w && ry >= y && ry < y + h;
        beside && !under
    })
}

fn corner_anchor(town: &Town, kind: BuildingKind, corner: usize) -> (i32, i32) {
    let (width, height) = kind.footprint();
    let (width, height) = (i32::from(width), i32::from(height));
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
    (x, y)
}

pub(super) fn civic_anchors(sim: &Simulation, lineage: &str, kind: BuildingKind) -> Vec<(i32, i32)> {
    let Some(town) = town_for(sim, lineage, kind)
        .map(|i| &sim.towns[i])
        .filter(|t| t.planned)
    else {
        return Vec::new();
    };
    let first = owned_count(sim, lineage, &CIVIC_KINDS) % 4;
    (0..4)
        .map(|k| corner_anchor(town, kind, (first + k) % 4))
        .collect()
}

pub(super) fn shore_point(sim: &Simulation, kind: BuildingKind, center: (i32, i32)) -> Option<(i32, i32)> {
    nearest_shore(sim, kind, center)
}

/// How far from a town's centre it looks for a shore to put a harbour on.
const SHORE_SEARCH_RADIUS: i32 = 24;

/// The nearest place on the shore where `kind` fits the ground: a dry, unfrozen tile beside open
/// water that a footprint of `kind` covering it would pass the terrain check (water along its side
/// included) and no building or town street already covers. Searches square rings out from `center` and takes the
/// closest such tile of the first ring that has one; returns the footprint's corner. A shore too
/// cramped or already built on is passed over for one further along.
fn nearest_shore(sim: &Simulation, kind: BuildingKind, center: (i32, i32)) -> Option<(i32, i32)> {
    use crate::world::tiles::Tile;
    let (w, h) = kind.footprint();
    let dry_shore = |x: i32, y: i32| {
        WorldGrid::in_bounds(x, y)
            && !matches!(sim.grid.get(x, y), Tile::Water | Tile::Ice)
            && [(1, 0), (-1, 0), (0, 1), (0, -1)]
                .iter()
                .any(|&(dx, dy)| sim.grid.get(x + dx, y + dy) == Tile::Water)
    };
    // Tiles standing buildings cover, gathered once so each candidate is a few lookups.
    let built: crate::hashing::FxHashSet<(i32, i32)> = sim
        .buildings
        .iter()
        .filter(|b| !b.decorative)
        .flat_map(|b| {
            let (bw, bh) = b.footprint();
            (b.y..b.y + i32::from(bh)).flat_map(move |ty| (b.x..b.x + i32::from(bw)).map(move |tx| (tx, ty)))
        })
        .collect();
    // Free of standing buildings and of the plazas and streets towns keep open.
    let free = |fx: i32, fy: i32| {
        (fy..fy + i32::from(h)).all(|ty| {
            (fx..fx + i32::from(w)).all(|tx| !built.contains(&(tx, ty)) && !town_reserved(sim, tx, ty))
        })
    };
    // The corner of a footprint covering (x, y) that the ground accepts and no building holds, if any.
    let fits_at = |x: i32, y: i32| {
        (0..i32::from(h))
            .flat_map(|oy| (0..i32::from(w)).map(move |ox| (x - ox, y - oy)))
            .find(|&(fx, fy)| {
                super::construction::construction_terrain_is_valid(sim, kind, fx, fy) && free(fx, fy)
            })
    };
    (0..=SHORE_SEARCH_RADIUS).find_map(|radius| {
        let mut ring: Vec<(i32, i32)> = (-radius..=radius)
            .flat_map(|dy| (-radius..=radius).map(move |dx| (dx, dy)))
            .filter(|&(dx, dy)| dx.abs() == radius || dy.abs() == radius)
            .filter(|&(dx, dy)| dry_shore(center.0 + dx, center.1 + dy))
            .collect();
        // The closest tiles of the ring first, not the first ones scanned.
        ring.sort_by_key(|&(dx, dy)| dx * dx + dy * dy);
        ring.into_iter()
            .find_map(|(dx, dy)| fits_at(center.0 + dx, center.1 + dy))
    })
}

/// The era a town raises its market in, and the population it needs first.
const MARKET_ERA: Era = Era::Bronze;
const MARKET_POPULATION: usize = 8;

/// True when a town of this lineage has no market yet and has the people and
/// the era for one. Its market then goes on the plaza before more homes.
pub(super) fn town_market_wanted(sim: &Simulation, lineage: &str, era: Era, pop: usize) -> bool {
    era >= MARKET_ERA
        && pop >= construction_population_requirement(MARKET_POPULATION, sim.population_limit())
        && sim
            .towns
            .iter()
            .any(|town| town.lineage == lineage && town.planned)
        && owned_count(sim, lineage, &[BuildingKind::Market]) == 0
}

/// True when a town wants its market and can pay for it now.
pub(super) fn town_market_due(sim: &Simulation, lineage: &str, era: Era, pop: usize) -> bool {
    town_market_wanted(sim, lineage, era, pop)
        && construction_cost_available(sim, lineage, BuildingKind::Market)
}

/// The era a town raises its fountain in.
const FOUNTAIN_ERA: Era = Era::Classical;

/// The plaza centre a town wants its fountain on: the town has a plaza, has reached the classical
/// age, and has no fountain yet. The fountain's basin becomes water in the middle of the square.
pub(super) fn town_fountain_site(sim: &Simulation, lineage: &str, era: Era) -> Option<(i32, i32)> {
    if era < FOUNTAIN_ERA || owned_count(sim, lineage, &[BuildingKind::Fountain]) > 0 {
        return None;
    }
    main_town(sim, lineage)
        .filter(|town| town.planned)
        .map(|town| (town.center[0], town.center[1]))
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TownCounts {
    pub towns: usize,
    pub planned: usize,
    pub lineages_with_several: usize,
    pub buildings: usize,
    pub decorative: usize,
    pub without_town: usize,
    pub without_town_living: usize,
    pub without_town_functional: usize,
    pub outside_zone: usize,
}

pub fn town_counts(sim: &Simulation) -> TownCounts {
    let by_id: HashMap<u32, &Town> = sim.towns.iter().map(|t| (t.id, t)).collect();
    let mut per_lineage: HashMap<&str, usize> = HashMap::default();
    for t in &sim.towns {
        *per_lineage.entry(t.lineage.as_str()).or_insert(0) += 1;
    }
    let mut counts = TownCounts {
        towns: sim.towns.len(),
        planned: sim.towns.iter().filter(|t| t.planned).count(),
        lineages_with_several: per_lineage.values().filter(|&&n| n > 1).count(),
        ..TownCounts::default()
    };
    let living: HashSet<&str> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect();
    for b in sim.buildings.iter().filter(|b| !b.is_ruined()) {
        counts.buildings += 1;
        if b.decorative {
            counts.decorative += 1;
        }
        let Some(town) = b.town.and_then(|id| by_id.get(&id)) else {
            counts.without_town += 1;
            if b.owner_lineage.as_deref().is_some_and(|l| living.contains(l)) {
                counts.without_town_living += 1;
                if !b.decorative {
                    counts.without_town_functional += 1;
                }
            }
            continue;
        };
        if let Some((lo, hi)) = zone_of(b.kind).ring().filter(|_| !b.decorative) {
            let d = town.distance(b.x, b.y);
            if d < lo || d > hi {
                counts.outside_zone += 1;
            }
        }
    }
    counts
}

pub fn town_centres(sim: &Simulation) -> Vec<(u32, [i32; 2])> {
    sim.towns.iter().map(|t| (t.id, t.center)).collect()
}

pub fn lineage_centres(sim: &Simulation) -> Vec<(String, [i32; 2])> {
    let mut lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    lineages.sort();
    lineages.dedup();
    lineages
        .into_iter()
        .map(|l| {
            let (x, y) = lineage_center(sim, &l);
            (l, [x, y])
        })
        .collect()
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

    fn in_plaza(town: &Town, x: i32, y: i32) -> bool {
        (x - town.center[0]).abs() <= PLAZA_RADIUS && (y - town.center[1]).abs() <= PLAZA_RADIUS
    }

    #[test]
    fn a_hamlet_paves_a_plaza_with_four_streets_round_its_centre() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_towns(&mut sim);
        assert_eq!(sim.towns.len(), 1, "one plaza for the clan");
        let town = sim.towns[0].clone();
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
        tick_towns(&mut sim);
        assert_eq!(sim.towns.len(), 1);
    }

    #[test]
    fn a_town_laid_out_on_a_rail_line_keeps_the_line_whole() {
        use crate::world::grid::ROAD_RAIL;
        let mut sim = clan_sim(12, TOWN_TIER);
        let (cx, cy) = lineage_center(&sim, "clan");
        let line: Vec<(i32, i32)> = (30..=70)
            .map(|x| (x, cy))
            .chain((30..=70).map(|y| (cx, y)))
            .collect();
        for &(x, y) in &line {
            sim.grid.road[WorldGrid::idx(x, y)] = ROAD_RAIL;
        }
        tick_towns(&mut sim);
        assert_eq!(sim.towns.len(), 1);
        let town = sim.towns[0].clone();
        for &(x, y) in &line {
            assert_eq!(sim.grid.road_at(x, y), ROAD_RAIL, "the rail at {x},{y} stays");
            assert!(
                !in_plaza(&town, x, y),
                "the plaza is paved over the line at {x},{y}"
            );
        }
    }

    #[test]
    fn a_camp_gets_an_anchor_but_no_plaza() {
        let mut sim = clan_sim(12, TOWN_TIER - 1);
        tick_towns(&mut sim);
        assert_eq!(sim.towns.len(), 1);
        assert!(!sim.towns[0].planned);
        assert!(sim.towns[0].streets.is_empty());
        let [cx, cy] = sim.towns[0].center;
        assert_eq!(sim.grid.road_at(cx, cy), ROAD_NONE);
    }

    #[test]
    fn a_town_centre_stays_put_while_its_people_wander() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_towns(&mut sim);
        let centre = sim.towns[0].center;
        let id = sim.towns[0].id;
        for step in 0..40 {
            for (i, o) in sim.organisms.iter_mut().enumerate() {
                o.x = 35.0 + ((i * 7 + step * 3) % 30) as f32;
                o.y = 35.0 + ((i * 11 + step * 5) % 30) as f32;
            }
            sim.tick_count += 240;
            tick_towns(&mut sim);
        }
        assert_eq!(sim.towns.len(), 1);
        assert_eq!((sim.towns[0].id, sim.towns[0].center), (id, centre));
    }

    #[test]
    fn a_tribe_that_spreads_far_founds_a_second_town() {
        let mut sim = clan_sim(12, TOWN_TIER);
        for y in 30..=70 {
            for x in 100..=140 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        tick_towns(&mut sim);
        assert_eq!(sim.towns.len(), 1);
        for (i, o) in sim.organisms.iter_mut().enumerate().take(NEW_TOWN_PEOPLE) {
            o.home_x = 118.0 + (i % 4) as f32;
            o.home_y = 48.0 + (i / 4) as f32;
        }
        for _ in 0..3 {
            tick_towns(&mut sim);
        }
        assert_eq!(sim.towns.len(), 2, "a second town where the settlers live");
        let far = sim
            .towns
            .iter()
            .find(|t| t.center[0] > 100)
            .expect("the new town");
        assert_eq!(far.lineage, "clan");
        assert_ne!(far.id, sim.towns[0].id);
    }

    #[test]
    fn buildings_get_their_town_as_parent_and_keep_to_its_zones() {
        let mut sim = clan_sim(30, TOWN_TIER);
        sim.lineage_eras.insert("clan".into(), Era::Bronze);
        tick_towns(&mut sim);
        for _ in 0..60 {
            tick_towns(&mut sim);
            tick_buildings_construct(&mut sim);
            for building in sim.buildings.iter_mut() {
                building.condition = 1.0;
            }
        }
        let town = sim.towns[0].clone();
        assert!(
            sim.buildings.len() >= 5,
            "the clan builds, {} stand",
            sim.buildings.len()
        );
        for b in &sim.buildings {
            assert_eq!(
                b.town,
                Some(town.id),
                "{:?} at {},{} has its town",
                b.kind,
                b.x,
                b.y
            );
        }
        let counts = town_counts(&sim);
        assert_eq!(counts.without_town, 0);
        assert!(
            counts.outside_zone * 10 <= counts.buildings,
            "most buildings keep to their zone: {counts:?}"
        );
    }

    #[test]
    fn an_old_save_gets_anchors_and_parents_on_load() {
        let mut sim = clan_sim(12, TOWN_TIER);
        let mut hut = Building::new(7, BuildingKind::Hut, 49, 52, Some("clan".into()), 0);
        hut.condition = 1.0;
        sim.buildings.push(hut);
        let mut value = serde_json::to_value(sim.to_save_state()).expect("save state as a value");
        let object = value.as_object_mut().expect("object");
        object.remove("towns");
        object.remove("next_town_id");
        let loaded: SaveState = serde_json::from_value(value).expect("an old save parses");
        let back = Simulation::from_save(0x70_4E, loaded);
        assert_eq!(back.towns.len(), 1, "the clan gets an anchor");
        assert!(!back.towns[0].planned, "no paving happens on load");
        assert_eq!(back.buildings[0].town, Some(back.towns[0].id));
        assert!(back.next_town_id > back.towns[0].id);
    }

    #[test]
    fn an_old_plaza_becomes_a_planned_town_with_an_id() {
        let mut value = serde_json::to_value(clan_sim(12, TOWN_TIER).to_save_state()).expect("a value");
        let object = value.as_object_mut().expect("object");
        object.remove("towns");
        object.remove("next_town_id");
        object.insert(
            "town_plazas".into(),
            serde_json::json!([{"lineage": "clan", "center": [50, 50], "streets": [[52, 50]]}]),
        );
        let loaded: SaveState = serde_json::from_value(value).expect("an old save parses");
        let back = Simulation::from_save(0x70_4E, loaded);
        assert_eq!(back.towns.len(), 1);
        assert!(back.towns[0].planned);
        assert_eq!(back.towns[0].center, [50, 50]);
        assert!(back.towns[0].id > 0);
    }

    #[test]
    fn homes_stand_along_the_streets_and_keep_off_the_plaza() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_towns(&mut sim);
        for _ in 0..60 {
            tick_buildings_construct(&mut sim);
            // Workers finish each project between passes, so the next pass can start another.
            for building in sim.buildings.iter_mut() {
                building.condition = 1.0;
            }
        }
        let town = sim.towns[0].clone();
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
        tick_towns(&mut sim);
        let town = sim.towns[0].clone();
        let [cx, cy] = town.center;
        let (w, h) = BuildingKind::Temple.footprint();
        let mut corners = Vec::new();
        for k in 0..4 {
            let (x, y) = civic_anchors(&sim, "clan", BuildingKind::Temple)[0];
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
        tick_towns(&mut sim);
        let town = sim.towns[0].clone();
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
        tick_towns(&mut sim);
        let json = serde_json::to_string(&sim.to_save_state()).expect("save state serialises");
        let loaded: SaveState = serde_json::from_str(&json).expect("save state parses");
        let back = Simulation::from_save(0x70_4E, loaded);
        assert_eq!(back.towns, sim.towns);
    }

    #[test]
    fn a_lineage_that_dies_out_loses_its_plaza_record() {
        let mut sim = clan_sim(12, TOWN_TIER);
        tick_towns(&mut sim);
        let center = sim.towns[0].center;
        for org in sim.organisms.iter_mut() {
            org.alive = false;
        }
        tick_towns(&mut sim);
        assert!(sim.towns.is_empty());
        assert_eq!(
            sim.grid.road_at(center[0], center[1]),
            ROAD_TRACK,
            "the paving stays on the map"
        );
        assert_ne!(sim.grid.road_at(center[0], center[1]), ROAD_NONE);
    }
}
