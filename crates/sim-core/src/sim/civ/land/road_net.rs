use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::hashing::{FxHashMap, FxHashSet};
use crate::sim::civ::civ_tick::town::main_town;
use crate::sim::civ::land::village_roads::{lineages_that_build_roads, plan_way, StepCost, Way};
use crate::sim::civ::settlements;
use crate::sim::civ::warfare::TreatyKind;
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::tech::networks::POWER_SOURCES;
use crate::sim::tech::railways::stop_of;
use crate::world::grid::{TrailKind, WorldGrid, ROAD_BRIDGE, ROAD_CANAL, ROAD_NONE, ROAD_RAIL, ROAD_TRACK};
use crate::world::tiles::Tile;

pub const NET_STEP: u64 = 300;
const VILLAGE_TIER: u8 = 3;
const TOWN_LINK_REACH: i32 = 90;
const PARTNER_REACH: i32 = 70;
const RESOURCE_REACH: i32 = 24;
const RESOURCE_NEAR: i32 = 5;
const FIELD_GAP: i32 = 8;
const MAX_EDGES_PER_OWNER: usize = 16;
const MAX_EDGES: usize = 320;
const PLANS_PER_PASS: usize = 6;
const FAILED_PASSES: u64 = 8;
const MAX_CELLS_PER_PASS: u32 = 12;
const MIN_CELLS_PER_PASS: u32 = 2;
const CELLS_PER_STONE: u16 = 4;
const UNWANTED_TICKS: u64 = 4 * crate::sim::cosmos::DAY_LENGTH;
const UNUSED_TICKS: u64 = 10 * crate::sim::cosmos::DAY_LENGTH;
const LEGACY_PER_PASS: usize = 24;
const WEAR_GONE_PASSES: u8 = 8;
const TRODDEN: f32 = 0.3;
const WALKED: f32 = 0.15;
const TRIP: u32 = 16;
const ROAD_TRAFFIC: u32 = 10 * TRIP;
const PAVED_TRAFFIC: u32 = 40 * TRIP;
pub(crate) const RAIL_TRAFFIC: u32 = 30 * TRIP;
pub(crate) const CARAVAN_TRAFFIC: u32 = 4 * TRIP;
const COST_ROAD: u32 = 1;
const COST_GROUND: u32 = 3;
const COST_ROUGH: u32 = 5;
const COST_FIELD: u32 = 6;
const COST_CROSSING: u32 = 4;
const COST_BRIDGE: u32 = 6;
const SLOPE_COST: f32 = 80.0;
const MAX_SLOPE_COST: u32 = 12;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NetKind {
    #[default]
    Road,
    Power,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Dest {
    #[default]
    Town,
    Partner,
    Quarry,
    Mine,
    Forest,
    Harbour,
    Well,
    Fields,
    Legacy,
}

impl Dest {
    pub fn name(self) -> &'static str {
        match self {
            Dest::Town => "town",
            Dest::Partner => "partner",
            Dest::Quarry => "quarry",
            Dest::Mine => "mine",
            Dest::Forest => "forest",
            Dest::Harbour => "harbour",
            Dest::Well => "well",
            Dest::Fields => "fields",
            Dest::Legacy => "legacy",
        }
    }

    fn rank(self) -> u8 {
        match self {
            Dest::Town => 0,
            Dest::Partner => 1,
            Dest::Fields | Dest::Well => 3,
            _ => 2,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Dest::Town | Dest::Partner | Dest::Legacy => "",
            Dest::Quarry => "the quarry",
            Dest::Mine => "the mine",
            Dest::Forest => "the sawmill",
            Dest::Harbour => "the harbour",
            Dest::Well => "the well",
            Dest::Fields => "the fields",
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct NetEdge {
    pub id: u32,
    pub kind: NetKind,
    pub owner: String,
    pub dest: Dest,
    pub from_town: u32,
    pub to_town: Option<u32>,
    pub from: [i32; 2],
    pub to: [i32; 2],
    pub path: Vec<[i32; 2]>,
    pub built: u16,
    pub traffic: u32,
    pub last_used: u64,
    pub last_wanted: u64,
    pub grade: u8,
    pub laid_tick: u64,
}

impl NetEdge {
    pub fn complete(&self) -> bool {
        usize::from(self.built) >= self.path.len()
    }

    pub fn built_cells(&self) -> &[[i32; 2]] {
        &self.path[..usize::from(self.built).min(self.path.len())]
    }

    fn joins(&self, a: [i32; 2], b: [i32; 2]) -> bool {
        (self.from == a && self.to == b) || (self.from == b && self.to == a)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoadWear {
    pub at: [i32; 2],
    pub passes: u8,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FailedPlan {
    pub from: [i32; 2],
    pub to: [i32; 2],
    pub tick: u64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct NetStats {
    pub caravans_on_roads: u64,
    pub caravans_off_roads: u64,
    pub caravan_path: f64,
    pub caravan_straight: f64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct RoadNet {
    pub edges: Vec<NetEdge>,
    pub next_id: u32,
    pub wear: Vec<RoadWear>,
    pub failed: Vec<FailedPlan>,
    pub legacy_done: bool,
    #[serde(skip)]
    pub stats: NetStats,
    #[serde(skip)]
    index: Option<FxHashMap<u32, u32>>,
}

impl PartialEq for RoadNet {
    fn eq(&self, other: &Self) -> bool {
        self.edges == other.edges
            && self.next_id == other.next_id
            && self.wear == other.wear
            && self.failed == other.failed
            && self.legacy_done == other.legacy_done
    }
}

impl RoadNet {
    pub fn is_empty(&self) -> bool {
        self.edges.is_empty() && self.wear.is_empty() && self.failed.is_empty() && !self.legacy_done
    }

    fn planned(&self) -> usize {
        self.edges
            .iter()
            .filter(|e| e.kind == NetKind::Road && e.dest != Dest::Legacy)
            .count()
    }

    fn touched(&mut self) {
        self.index = None;
    }

    fn cell_index(&mut self) -> &FxHashMap<u32, u32> {
        self.index.get_or_insert_with(|| {
            let mut index = FxHashMap::default();
            for edge in self.edges.iter().filter(|e| e.kind == NetKind::Road) {
                for &[x, y] in edge.built_cells() {
                    if WorldGrid::in_bounds(x, y) {
                        index.entry(WorldGrid::idx(x, y) as u32).or_insert(edge.id);
                    }
                }
            }
            index
        })
    }

    pub fn edge(&self, id: u32) -> Option<&NetEdge> {
        match self.edges.binary_search_by_key(&id, |e| e.id) {
            Ok(i) => Some(&self.edges[i]),
            Err(_) => self.edges.iter().find(|e| e.id == id),
        }
    }

    pub fn shift(&mut self, dx: i32, dy: i32) {
        let move_by = |p: &mut [i32; 2]| {
            p[0] += dx;
            p[1] += dy;
        };
        for edge in &mut self.edges {
            move_by(&mut edge.from);
            move_by(&mut edge.to);
            edge.path.iter_mut().for_each(move_by);
        }
        for wear in &mut self.wear {
            move_by(&mut wear.at);
        }
        for failed in &mut self.failed {
            move_by(&mut failed.from);
            move_by(&mut failed.to);
        }
        self.touched();
    }

    pub fn grades(&self) -> FxHashMap<usize, u8> {
        let mut out: FxHashMap<usize, u8> = FxHashMap::default();
        for edge in self.edges.iter().filter(|e| e.kind == NetKind::Road) {
            for &[x, y] in edge.built_cells() {
                if WorldGrid::in_bounds(x, y) {
                    let g = out.entry(WorldGrid::idx(x, y)).or_insert(0);
                    *g = (*g).max(edge.grade + 1);
                }
            }
        }
        out
    }
}

pub(crate) fn note_route(sim: &mut Simulation, cells: &[(i32, i32)], amount: u32) {
    if sim.road_net.edges.is_empty() {
        return;
    }
    let now = sim.tick_count;
    let index = sim.road_net.cell_index();
    let used: BTreeSet<u32> = cells
        .iter()
        .filter(|&&(x, y)| WorldGrid::in_bounds(x, y))
        .filter_map(|&(x, y)| index.get(&(WorldGrid::idx(x, y) as u32)).copied())
        .collect();
    for edge in sim.road_net.edges.iter_mut().filter(|e| used.contains(&e.id)) {
        edge.traffic = edge.traffic.saturating_add(amount * TRIP);
        edge.last_used = now;
    }
}

pub(crate) fn wear_cells(sim: &mut Simulation, cells: &[[i32; 2]]) {
    if cells.is_empty() {
        return;
    }
    let mut known: FxHashSet<[i32; 2]> = sim.road_net.wear.iter().map(|w| w.at).collect();
    let reserved = reserved_tiles(sim);
    for &[x, y] in cells {
        if WorldGrid::in_bounds(x, y)
            && sim.grid.road_at(x, y) == ROAD_TRACK
            && !reserved.contains(&(x, y))
            && known.insert([x, y])
        {
            sim.road_net.wear.push(RoadWear {
                at: [x, y],
                passes: 0,
            });
        }
    }
}

fn reserved_tiles(sim: &Simulation) -> FxHashSet<(i32, i32)> {
    sim.towns.iter().flat_map(|t| t.reserved_tiles()).collect()
}

pub(crate) struct CaravanWay {
    pub legs: Vec<(u32, bool)>,
    pub walk: u64,
    pub length: f64,
    pub grade: u8,
}

fn walk_of(path: &[[i32; 2]]) -> u64 {
    path.windows(2)
        .map(|w| u64::from((w[1][0] - w[0][0]).unsigned_abs() + (w[1][1] - w[0][1]).unsigned_abs()))
        .sum()
}

pub(crate) fn caravan_way(sim: &Simulation, from: [i32; 2], to: [i32; 2]) -> Option<CaravanWay> {
    if from == to {
        return None;
    }
    let roads: Vec<&NetEdge> = sim
        .road_net
        .edges
        .iter()
        .filter(|e| {
            e.kind == NetKind::Road
                && matches!(e.dest, Dest::Town | Dest::Partner)
                && e.complete()
                && e.path.len() > 1
        })
        .collect();
    if !roads.iter().any(|e| e.from == from || e.to == from)
        || !roads.iter().any(|e| e.from == to || e.to == to)
    {
        return None;
    }
    let walks: Vec<u64> = roads.iter().map(|e| walk_of(&e.path)).collect();
    let mut links: BTreeMap<[i32; 2], Vec<usize>> = BTreeMap::new();
    for (i, e) in roads.iter().enumerate() {
        links.entry(e.from).or_default().push(i);
        links.entry(e.to).or_default().push(i);
    }
    let mut best: BTreeMap<[i32; 2], u64> = BTreeMap::new();
    let mut came: BTreeMap<[i32; 2], (usize, bool, [i32; 2])> = BTreeMap::new();
    let mut heap = std::collections::BinaryHeap::new();
    best.insert(from, 0);
    heap.push(std::cmp::Reverse((0u64, from)));
    while let Some(std::cmp::Reverse((d, at))) = heap.pop() {
        if best.get(&at).is_some_and(|&b| b < d) {
            continue;
        }
        if at == to {
            break;
        }
        for &i in links.get(&at).map(Vec::as_slice).unwrap_or(&[]) {
            let e = roads[i];
            let (next, reverse) = if e.from == at {
                (e.to, false)
            } else if e.to == at {
                (e.from, true)
            } else {
                continue;
            };
            let nd = d + walks[i];
            if best.get(&next).is_none_or(|&b| nd < b) {
                best.insert(next, nd);
                came.insert(next, (i, reverse, at));
                heap.push(std::cmp::Reverse((nd, next)));
            }
        }
    }
    let walk = *best.get(&to)?;
    let mut legs = Vec::new();
    let mut at = to;
    while at != from {
        let &(i, reverse, prev) = came.get(&at)?;
        legs.push((roads[i].id, reverse));
        at = prev;
    }
    legs.reverse();
    let used = |id: u32| roads.iter().find(|e| e.id == id);
    let length = legs
        .iter()
        .filter_map(|&(id, _)| used(id))
        .flat_map(|e| e.path.windows(2))
        .map(|w| f64::from(w[1][0] - w[0][0]).hypot(f64::from(w[1][1] - w[0][1])))
        .sum();
    let grade = legs
        .iter()
        .filter_map(|&(id, _)| used(id))
        .map(|e| e.grade)
        .min()
        .unwrap_or(0);
    Some(CaravanWay {
        legs,
        walk,
        length,
        grade,
    })
}

pub(crate) fn cells_along(sim: &Simulation, legs: &[(u32, bool)]) -> Vec<[i32; 2]> {
    let mut out: Vec<[i32; 2]> = Vec::new();
    for &(id, reverse) in legs {
        let Some(edge) = sim.road_net.edge(id) else {
            return Vec::new();
        };
        let cells: Box<dyn Iterator<Item = &[i32; 2]>> = if reverse {
            Box::new(edge.path.iter().rev())
        } else {
            Box::new(edge.path.iter())
        };
        for &cell in cells {
            if out.last() != Some(&cell) {
                out.push(cell);
            }
        }
    }
    out
}

pub(crate) fn point_along(sim: &Simulation, legs: &[(u32, bool)], progress: f64) -> Option<[i32; 2]> {
    let paths: Vec<(&[[i32; 2]], bool)> = legs
        .iter()
        .map(|&(id, reverse)| sim.road_net.edge(id).map(|e| (e.path.as_slice(), reverse)))
        .collect::<Option<_>>()?;
    let total: usize = paths.iter().map(|(p, _)| p.len()).sum();
    if total == 0 {
        return None;
    }
    let mut at = ((progress.clamp(0.0, 1.0) * (total - 1) as f64).round() as usize).min(total - 1);
    for (path, reverse) in paths {
        if at < path.len() {
            return Some(path[if reverse { path.len() - 1 - at } else { at }]);
        }
        at -= path.len();
    }
    None
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

fn footprint_cells(sim: &Simulation) -> FxHashSet<(i32, i32)> {
    let mut out = FxHashSet::default();
    for b in &sim.buildings {
        let (w, h) = b.footprint();
        for y in b.y..b.y + i32::from(h) {
            for x in b.x..b.x + i32::from(w) {
                out.insert((x, y));
            }
        }
    }
    out
}

pub(crate) fn road_cost<'a>(
    grid: &'a WorldGrid,
    covered: &'a FxHashSet<(i32, i32)>,
    fields: &'a FxHashSet<(i32, i32)>,
) -> impl Fn(i32, i32, i32, i32, bool) -> Option<u32> + 'a {
    move |x, y, px, py, target| {
        let road = grid.road_at(x, y);
        let tile = grid.get(x, y);
        let base = match road {
            ROAD_TRACK | ROAD_BRIDGE => COST_ROAD,
            ROAD_RAIL | ROAD_CANAL if tile.road_ground() => COST_CROSSING,
            _ if !tile.road_ground() => {
                if target {
                    COST_GROUND
                } else {
                    return None;
                }
            }
            _ if fields.contains(&(x, y)) => COST_FIELD,
            _ if matches!(tile, Tile::Snow | Tile::Ash) => COST_ROUGH,
            _ => COST_GROUND,
        };
        if !target && covered.contains(&(x, y)) {
            return None;
        }
        let rise = (grid.elevation[WorldGrid::idx(x, y)] - grid.elevation[WorldGrid::idx(px, py)]).abs();
        let slope = ((rise * SLOPE_COST).round() as u32).min(MAX_SLOPE_COST);
        Some(base + slope)
    }
}

pub(crate) fn plan_road_way(
    grid: &WorldGrid,
    from: [i32; 2],
    to: [i32; 2],
    covered: &FxHashSet<(i32, i32)>,
    fields: &FxHashSet<(i32, i32)>,
) -> Option<Vec<[i32; 2]>> {
    let cost = road_cost(grid, covered, fields);
    let step: &StepCost = &cost;
    let way = Way {
        step,
        bridge: Some((COST_BRIDGE, None)),
        weight: 2,
    };
    let mut path = plan_way(grid, from, to, &way)?;
    path.insert(0, from);
    let mut run = 0;
    for &[x, y] in &path {
        if grid.get(x, y) == Tile::Water && grid.road_at(x, y) != ROAD_BRIDGE {
            run += 1;
            if run > crate::sim::civ::land::village_roads::MAX_SPAN {
                return None;
            }
        } else {
            run = 0;
        }
    }
    Some(path)
}

struct Want {
    owner: String,
    dest: Dest,
    from_town: u32,
    to_town: Option<u32>,
    from: [i32; 2],
    to: [i32; 2],
}

fn resource_dest(kind: BuildingKind) -> Option<Dest> {
    match kind {
        BuildingKind::Quarry => Some(Dest::Quarry),
        BuildingKind::Mine => Some(Dest::Mine),
        BuildingKind::SawMill => Some(Dest::Forest),
        BuildingKind::Well => Some(Dest::Well),
        k if k.needs_shore() && k != BuildingKind::Lighthouse && k != BuildingKind::Lighthouse2 => {
            Some(Dest::Harbour)
        }
        _ => None,
    }
}

fn allied(sim: &Simulation, a: &str, b: &str) -> bool {
    sim.treaties.iter().any(|t| {
        matches!(
            t.kind,
            TreatyKind::Alliance | TreatyKind::Trade | TreatyKind::Defensive
        ) && ((t.lineage_a == a && t.lineage_b == b) || (t.lineage_a == b && t.lineage_b == a))
    })
}

fn wanted(sim: &Simulation, knowing: &BTreeSet<String>) -> Vec<Want> {
    let tiers: BTreeMap<String, u8> = settlements::snapshots_this_tick(sim)
        .iter()
        .map(|s| (s.lineage_id.clone(), s.tier))
        .collect();
    let capitals: BTreeMap<&str, u32> = sim
        .towns
        .iter()
        .map(|t| t.lineage.as_str())
        .collect::<BTreeSet<&str>>()
        .into_iter()
        .filter_map(|l| main_town(sim, l).map(|t| (l, t.id)))
        .collect();
    let town = |id: u32| sim.towns.iter().find(|t| t.id == id);
    let mut resources: BTreeMap<&str, Vec<(Dest, [i32; 2])>> = BTreeMap::new();
    for b in sim
        .buildings
        .iter()
        .filter(|b| b.is_operational() && !b.decorative)
    {
        let (Some(owner), Some(dest)) = (b.owner_lineage.as_deref(), resource_dest(b.kind)) else {
            continue;
        };
        if knowing.contains(owner) {
            resources.entry(owner).or_default().push((dest, stop_of(b)));
        }
    }
    let mut out = Vec::new();
    for owner in knowing {
        if tiers.get(owner).copied().unwrap_or(0) < VILLAGE_TIER {
            continue;
        }
        let Some(&capital) = capitals.get(owner.as_str()) else {
            continue;
        };
        let mut mine: Vec<&crate::sim::civ::civ_tick::town::Town> =
            sim.towns.iter().filter(|t| &t.lineage == owner).collect();
        mine.sort_by_key(|t| (t.id != capital, t.id));
        let mut joined = vec![mine[0]];
        let mut left: Vec<_> = mine[1..].to_vec();
        while !left.is_empty() {
            let best = left
                .iter()
                .enumerate()
                .flat_map(|(i, t)| {
                    joined
                        .iter()
                        .map(move |j| (chebyshev(t.center, j.center), t.id, j.id, i))
                })
                .min();
            let Some((d, child, parent, i)) = best else { break };
            let t = left.remove(i);
            joined.push(t);
            if d > TOWN_LINK_REACH {
                continue;
            }
            let (Some(p), Some(c)) = (town(parent), town(child)) else {
                continue;
            };
            out.push(Want {
                owner: owner.clone(),
                dest: Dest::Town,
                from_town: p.id,
                to_town: Some(c.id),
                from: p.center,
                to: c.center,
            });
        }
        for t in &mine {
            let mut best: BTreeMap<Dest, (i32, [i32; 2])> = BTreeMap::new();
            for &(dest, at) in resources.get(owner.as_str()).map(Vec::as_slice).unwrap_or(&[]) {
                let d = chebyshev(t.center, at);
                if d <= RESOURCE_NEAR || d > RESOURCE_REACH || !WorldGrid::in_bounds(at[0], at[1]) {
                    continue;
                }
                let entry = best.entry(dest).or_insert((i32::MAX, at));
                if (d, at) < *entry {
                    *entry = (d, at);
                }
            }
            let mut fields: Vec<(i32, [i32; 2])> = sim
                .farms
                .iter()
                .filter(|f| &f.owner_lineage == owner)
                .map(|f| (chebyshev(t.center, [f.x, f.y]), [f.x, f.y]))
                .filter(|&(d, _)| d > RESOURCE_NEAR && d <= RESOURCE_REACH)
                .collect();
            fields.sort();
            let mut picked: Vec<[i32; 2]> = Vec::new();
            for (_, at) in fields {
                if picked.len() >= 2 {
                    break;
                }
                if picked.iter().all(|&p| chebyshev(p, at) >= FIELD_GAP) {
                    picked.push(at);
                }
            }
            let resources = best
                .into_iter()
                .map(|(dest, (_, at))| (dest, at))
                .chain(picked.into_iter().map(|at| (Dest::Fields, at)));
            for (dest, at) in resources {
                out.push(Want {
                    owner: owner.clone(),
                    dest,
                    from_town: t.id,
                    to_town: None,
                    from: t.center,
                    to: at,
                });
            }
        }
    }
    let mut partners: BTreeSet<(String, String)> = BTreeSet::new();
    let recent = sim.tick_count.saturating_sub(UNUSED_TICKS);
    for route in sim
        .trade_routes
        .iter()
        .filter(|r| r.deliveries >= 1 && r.last_dispatch_tick >= recent)
    {
        partners.insert((route.lineage_a.clone(), route.lineage_b.clone()));
    }
    for t in &sim.treaties {
        if allied(sim, &t.lineage_a, &t.lineage_b) {
            let (a, b) = if t.lineage_a <= t.lineage_b {
                (t.lineage_a.clone(), t.lineage_b.clone())
            } else {
                (t.lineage_b.clone(), t.lineage_a.clone())
            };
            partners.insert((a, b));
        }
    }
    for (a, b) in partners {
        let owner = if knowing.contains(&a) && tiers.get(&a).copied().unwrap_or(0) >= VILLAGE_TIER {
            a.clone()
        } else if knowing.contains(&b) && tiers.get(&b).copied().unwrap_or(0) >= VILLAGE_TIER {
            b.clone()
        } else {
            continue;
        };
        let partner = if owner == a { &b } else { &a };
        let (Some(&home), Some(_)) = (capitals.get(owner.as_str()), capitals.get(partner.as_str())) else {
            continue;
        };
        let Some(home) = town(home) else { continue };
        let Some(there) = sim
            .towns
            .iter()
            .filter(|t| &t.lineage == partner)
            .min_by_key(|t| (chebyshev(t.center, home.center), t.id))
        else {
            continue;
        };
        if chebyshev(home.center, there.center) > PARTNER_REACH {
            continue;
        }
        out.push(Want {
            owner,
            dest: Dest::Partner,
            from_town: home.id,
            to_town: Some(there.id),
            from: home.center,
            to: there.center,
        });
    }
    out
}

fn take_stone(sim: &mut Simulation, owner: &str, want: u32) -> u32 {
    let mut got = 0;
    for org in sim
        .organisms
        .iter_mut()
        .filter(|o| o.alive && o.lineage_id == owner)
    {
        if got == want {
            break;
        }
        let take = (want - got).min(u32::from(org.inv_stone));
        org.inv_stone -= take as u8;
        got += take;
    }
    got
}

fn stone_of(sim: &Simulation, owner: &str) -> u32 {
    sim.organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == owner)
        .map(|o| u32::from(o.inv_stone))
        .sum()
}

fn name_of(sim: &Simulation, lineage: &str) -> String {
    sim.lineage_names
        .get(lineage)
        .cloned()
        .unwrap_or_else(|| lineage.to_string())
}

fn edge_label(sim: &Simulation, edge: &NetEdge) -> String {
    match edge.to_town.and_then(|id| sim.towns.iter().find(|t| t.id == id)) {
        Some(t) if t.lineage != edge.owner => format!("the town of {}", name_of(sim, &t.lineage)),
        Some(_) => "their other town".to_string(),
        None => edge.dest.label().to_string(),
    }
}

impl Simulation {
    pub(crate) fn tick_road_net(&mut self) {
        let living: FxHashSet<String> = self
            .organisms
            .iter()
            .filter(|o| o.alive)
            .map(|o| o.lineage_id.clone())
            .collect();
        let knowing: BTreeSet<String> = lineages_that_build_roads(self).into_iter().collect();
        let wants = wanted(self, &knowing);
        self.retire_edges(&living, &wants);
        self.migrate_legacy_roads();
        self.note_walkers();
        self.grade_roads();
        self.plan_new_edges(&wants);
        self.build_edges();
        self.sync_power_edges();
        self.wear_roads();
        self.road_net.touched();
    }

    fn retire_edges(&mut self, living: &FxHashSet<String>, wants: &[Want]) {
        let now = self.tick_count;
        let towns: FxHashSet<u32> = self.towns.iter().map(|t| t.id).collect();
        for edge in self.road_net.edges.iter_mut() {
            if wants
                .iter()
                .any(|w| w.owner == edge.owner && edge.joins(w.from, w.to))
            {
                edge.last_wanted = now;
            }
        }
        let mut gone: Vec<NetEdge> = Vec::new();
        let mut kept: Vec<NetEdge> = Vec::with_capacity(self.road_net.edges.len());
        for edge in std::mem::take(&mut self.road_net.edges) {
            let dead_owner = !living.contains(&edge.owner);
            let dead_town =
                !towns.contains(&edge.from_town) || edge.to_town.is_some_and(|t| !towns.contains(&t));
            let unwanted = edge.kind == NetKind::Road
                && edge.dest != Dest::Legacy
                && now.saturating_sub(edge.last_wanted) > UNWANTED_TICKS;
            let unused = edge.kind == NetKind::Road
                && edge.dest == Dest::Legacy
                && now.saturating_sub(edge.last_used.max(edge.laid_tick)) > UNUSED_TICKS;
            if dead_owner || (dead_town && edge.dest != Dest::Legacy) || unwanted || unused {
                gone.push(edge);
            } else {
                kept.push(edge);
            }
        }
        self.road_net.edges = kept;
        if gone.is_empty() {
            return;
        }
        self.road_net.touched();
        let live: FxHashSet<usize> = self
            .road_net
            .edges
            .iter()
            .filter(|e| e.kind == NetKind::Road)
            .flat_map(|e| e.built_cells().iter())
            .filter(|&&[x, y]| WorldGrid::in_bounds(x, y))
            .map(|&[x, y]| WorldGrid::idx(x, y))
            .collect();
        let mut fresh: Vec<[i32; 2]> = Vec::new();
        for edge in gone.iter().filter(|e| e.kind == NetKind::Road) {
            for &[x, y] in edge.built_cells() {
                if WorldGrid::in_bounds(x, y) && !live.contains(&WorldGrid::idx(x, y)) {
                    fresh.push([x, y]);
                }
            }
        }
        wear_cells(self, &fresh);
    }

    fn migrate_legacy_roads(&mut self) {
        if self.road_net.legacy_done {
            return;
        }
        let batch = self.village_roads.len().min(LEGACY_PER_PASS);
        let legacy: Vec<_> = self.village_roads.drain(..batch).collect();
        self.road_net.legacy_done = self.village_roads.is_empty();
        if legacy.is_empty() {
            return;
        }
        let covered = FxHashSet::default();
        let fields = FxHashSet::default();
        let now = self.tick_count;
        for road in legacy {
            let Some(town) = self
                .towns
                .iter()
                .filter(|t| t.lineage == road.lineage)
                .min_by_key(|t| (chebyshev(t.center, road.from), t.id))
            else {
                continue;
            };
            let (from_town, from) = (town.id, town.center);
            let Some(path) = plan_road_way(&self.grid, road.from, road.to, &covered, &fields) else {
                continue;
            };
            let owned: Vec<[i32; 2]> = path
                .into_iter()
                .filter(|&[x, y]| {
                    WorldGrid::in_bounds(x, y) && matches!(self.grid.road_at(x, y), ROAD_TRACK | ROAD_BRIDGE)
                })
                .collect();
            if owned.is_empty() {
                continue;
            }
            let id = self.road_net.next_id.max(1);
            self.road_net.next_id = id + 1;
            self.road_net.edges.push(NetEdge {
                id,
                kind: NetKind::Road,
                owner: road.lineage,
                dest: Dest::Legacy,
                from_town,
                to_town: None,
                from,
                to: road.to,
                built: owned.len().min(usize::from(u16::MAX)) as u16,
                path: owned,
                traffic: 0,
                last_used: now,
                last_wanted: now,
                grade: 0,
                laid_tick: now,
            });
        }
        self.road_net.touched();
    }

    fn note_walkers(&mut self) {
        let now = self.tick_count;
        let grid = &self.grid;
        for edge in self.road_net.edges.iter_mut().filter(|e| e.kind == NetKind::Road) {
            let cells = edge.built_cells();
            if cells.is_empty() {
                continue;
            }
            let walked = cells
                .iter()
                .filter(|&&[x, y]| grid.trail_at(x, y, TrailKind::Path) >= WALKED)
                .count();
            if walked * 8 >= cells.len() {
                let trips = (8 * walked as u32 * TRIP / cells.len() as u32).min(4 * TRIP);
                edge.traffic = edge.traffic.saturating_add(trips);
                edge.last_used = now;
            }
        }
    }

    fn grade_roads(&mut self) {
        let mut upgrades: Vec<(usize, u32)> = Vec::new();
        for (i, edge) in self.road_net.edges.iter_mut().enumerate() {
            if edge.kind != NetKind::Road || edge.dest == Dest::Legacy {
                continue;
            }
            edge.traffic -= edge.traffic.div_ceil(16);
            let floor = match edge.grade {
                2 => PAVED_TRAFFIC / 3,
                1 => ROAD_TRAFFIC / 3,
                _ => 0,
            };
            if edge.grade > 0 && edge.traffic < floor {
                edge.grade -= 1;
                continue;
            }
            let next = match edge.grade {
                0 if edge.traffic >= ROAD_TRAFFIC => Some(1),
                1 if edge.traffic >= PAVED_TRAFFIC => Some(2),
                _ => None,
            };
            if next.is_some() && edge.complete() {
                let per = if edge.grade == 0 { 8 } else { 4 };
                upgrades.push((i, (edge.path.len() as u32).div_ceil(per)));
            }
        }
        for (i, stone) in upgrades {
            let owner = self.road_net.edges[i].owner.clone();
            let era = self.era(&owner);
            let ready = match self.road_net.edges[i].grade {
                0 => era >= Era::Bronze,
                _ => era >= Era::Medieval,
            };
            if !ready || stone_of(self, &owner) < stone {
                continue;
            }
            take_stone(self, &owner, stone);
            self.road_net.edges[i].grade += 1;
        }
    }

    fn plan_new_edges(&mut self, wants: &[Want]) {
        let now = self.tick_count;
        self.road_net
            .failed
            .retain(|f| now.saturating_sub(f.tick) < FAILED_PASSES * NET_STEP);
        if self.road_net.planned() >= MAX_EDGES {
            return;
        }
        let owners: Vec<&str> = wants
            .iter()
            .map(|w| w.owner.as_str())
            .collect::<BTreeSet<&str>>()
            .into_iter()
            .collect();
        if owners.is_empty() {
            return;
        }
        let turn = ((now / NET_STEP) as usize) % owners.len();
        let mut picks: Vec<&Want> = Vec::new();
        for owner in owners[turn..].iter().chain(owners[..turn].iter()) {
            if picks.len() >= PLANS_PER_PASS {
                break;
            }
            let held = self
                .road_net
                .edges
                .iter()
                .filter(|e| e.kind == NetKind::Road && e.dest != Dest::Legacy && e.owner == *owner)
                .count();
            if held >= MAX_EDGES_PER_OWNER {
                continue;
            }
            let next = wants.iter().filter(|w| w.owner == *owner).filter(|w| {
                !self
                    .road_net
                    .edges
                    .iter()
                    .any(|e| e.kind == NetKind::Road && e.dest != Dest::Legacy && e.joins(w.from, w.to))
                    && !self
                        .road_net
                        .failed
                        .iter()
                        .any(|f| (f.from == w.from && f.to == w.to) || (f.from == w.to && f.to == w.from))
            });
            let next = next.min_by_key(|w| w.dest.rank());
            if let Some(w) = next {
                picks.push(w);
            }
        }
        if picks.is_empty() {
            return;
        }
        let covered = footprint_cells(self);
        let fields: FxHashSet<(i32, i32)> = self.farms.iter().map(|f| (f.x, f.y)).collect();
        for w in picks {
            if self.road_net.planned() >= MAX_EDGES {
                break;
            }
            let Some(path) = plan_road_way(&self.grid, w.from, w.to, &covered, &fields) else {
                self.road_net.failed.push(FailedPlan {
                    from: w.from,
                    to: w.to,
                    tick: now,
                });
                continue;
            };
            let id = self.road_net.next_id.max(1);
            self.road_net.next_id = id + 1;
            let built = path
                .iter()
                .take_while(|&&[x, y]| {
                    matches!(self.grid.road_at(x, y), ROAD_TRACK | ROAD_BRIDGE | ROAD_RAIL)
                })
                .count()
                .min(usize::from(u16::MAX)) as u16;
            self.road_net.edges.push(NetEdge {
                id,
                kind: NetKind::Road,
                owner: w.owner.clone(),
                dest: w.dest,
                from_town: w.from_town,
                to_town: w.to_town,
                from: w.from,
                to: w.to,
                path,
                built,
                traffic: 0,
                last_used: now,
                last_wanted: now,
                grade: 0,
                laid_tick: now,
            });
            if matches!(w.dest, Dest::Town | Dest::Partner) {
                let edge = self.road_net.edges.last().cloned().unwrap_or_default();
                let line = format!(
                    "The people of {} began a road to {}.",
                    name_of(self, &w.owner),
                    edge_label(self, &edge)
                );
                self.headlines.push_back((now, line));
            }
        }
    }

    fn build_edges(&mut self) {
        if self.road_net.edges.iter().all(|e| e.complete()) {
            return;
        }
        let mut labour: BTreeMap<String, u32> = BTreeMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            *labour.entry(o.lineage_id.clone()).or_insert(0) += 1;
        }
        let mut budget: BTreeMap<String, u32> = labour
            .into_iter()
            .map(|(l, n)| (l, (n / 3).clamp(MIN_CELLS_PER_PASS, MAX_CELLS_PER_PASS)))
            .collect();
        let covered = footprint_cells(self);
        let now = self.tick_count;
        let mut finished: Vec<usize> = Vec::new();
        for i in 0..self.road_net.edges.len() {
            if self.road_net.edges[i].complete() || self.road_net.edges[i].kind != NetKind::Road {
                continue;
            }
            let owner = self.road_net.edges[i].owner.clone();
            let mut left = budget.get(&owner).copied().unwrap_or(0);
            while left > 0 && !self.road_net.edges[i].complete() {
                let built = self.road_net.edges[i].built;
                let [x, y] = self.road_net.edges[i].path[usize::from(built)];
                let laid = write_road_cell(&mut self.grid, x, y, &covered);
                let paid =
                    !laid || !built.is_multiple_of(CELLS_PER_STONE) || take_stone(self, &owner, 1) == 1;
                left = left.saturating_sub(if paid { 1 } else { 2 });
                self.road_net.edges[i].built = built + 1;
            }
            budget.insert(owner, left);
            if self.road_net.edges[i].complete() {
                self.road_net.edges[i].last_used = now;
                finished.push(i);
            }
        }
        for i in finished {
            let edge = self.road_net.edges[i].clone();
            if matches!(edge.dest, Dest::Town | Dest::Partner) {
                let line = format!(
                    "The road of {} reached {}.",
                    name_of(self, &edge.owner),
                    edge_label(self, &edge)
                );
                self.headlines.push_back((now, line));
            }
        }
    }

    fn sync_power_edges(&mut self) {
        let sources: Vec<(String, [i32; 2])> = self
            .buildings
            .iter()
            .filter(|b| !b.decorative && b.is_operational() && POWER_SOURCES.contains(&b.kind))
            .filter_map(|b| b.owner_lineage.clone().map(|l| (l, [b.x, b.y])))
            .collect();
        let towns: FxHashMap<u32, [i32; 2]> = self.towns.iter().map(|t| (t.id, t.center)).collect();
        let powered = |owner: &str, town: u32| {
            towns.get(&town).is_some_and(|&c| {
                sources
                    .iter()
                    .any(|(l, at)| l == owner && chebyshev(*at, c) <= RESOURCE_REACH)
            })
        };
        let roads: Vec<NetEdge> = self
            .road_net
            .edges
            .iter()
            .filter(|e| e.kind == NetKind::Road && e.dest == Dest::Town && e.complete())
            .filter(|e| powered(&e.owner, e.from_town) || e.to_town.is_some_and(|t| powered(&e.owner, t)))
            .cloned()
            .collect();
        let before = self.road_net.edges.len();
        self.road_net.edges.retain(|e| {
            e.kind != NetKind::Power || roads.iter().any(|r| r.joins(e.from, e.to) && r.owner == e.owner)
        });
        let mut changed = before != self.road_net.edges.len();
        for road in roads {
            let exists =
                self.road_net.edges.iter().any(|e| {
                    e.kind == NetKind::Power && e.owner == road.owner && e.joins(road.from, road.to)
                });
            if exists {
                continue;
            }
            let id = self.road_net.next_id.max(1);
            self.road_net.next_id = id + 1;
            self.road_net.edges.push(NetEdge {
                id,
                kind: NetKind::Power,
                traffic: 0,
                grade: 0,
                ..road
            });
            changed = true;
        }
        if changed {
            self.road_net.touched();
        }
    }

    fn wear_roads(&mut self) {
        if self.road_net.wear.is_empty() {
            return;
        }
        let live: FxHashSet<usize> = self
            .road_net
            .edges
            .iter()
            .filter(|e| e.kind == NetKind::Road)
            .flat_map(|e| e.built_cells().iter())
            .filter(|&&[x, y]| WorldGrid::in_bounds(x, y))
            .map(|&[x, y]| WorldGrid::idx(x, y))
            .collect();
        let reserved = reserved_tiles(self);
        let mut kept = Vec::with_capacity(self.road_net.wear.len());
        for mut wear in std::mem::take(&mut self.road_net.wear) {
            let [x, y] = wear.at;
            if !WorldGrid::in_bounds(x, y) {
                continue;
            }
            let i = WorldGrid::idx(x, y);
            if self.grid.road[i] != ROAD_TRACK || live.contains(&i) || reserved.contains(&(x, y)) {
                continue;
            }
            wear.passes = wear.passes.saturating_add(1);
            if wear.passes >= WEAR_GONE_PASSES {
                if self.grid.trail_at(x, y, TrailKind::Path) < TRODDEN {
                    self.grid.road[i] = ROAD_NONE;
                    continue;
                }
                wear.passes = WEAR_GONE_PASSES / 2;
            }
            kept.push(wear);
        }
        self.road_net.wear = kept;
    }
}

fn write_road_cell(grid: &mut WorldGrid, x: i32, y: i32, covered: &FxHashSet<(i32, i32)>) -> bool {
    if !WorldGrid::in_bounds(x, y) {
        return false;
    }
    let i = WorldGrid::idx(x, y);
    let tile = grid.get(x, y);
    match grid.road[i] {
        ROAD_NONE if tile == Tile::Water => {
            grid.road[i] = ROAD_BRIDGE;
            true
        }
        ROAD_NONE if tile.road_ground() && !covered.contains(&(x, y)) => {
            grid.road[i] = ROAD_TRACK;
            true
        }
        _ => false,
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct NetCounts {
    pub edges: usize,
    pub complete: usize,
    pub paved: usize,
    pub graded: usize,
    pub power: usize,
    pub connecting_cells: usize,
    pub building_cells: usize,
    pub street_cells: usize,
    pub stub_cells: usize,
    pub wearing_cells: usize,
    pub old_road_cells: usize,
    pub rail_cells: usize,
    pub rail_on_roads: usize,
    pub upgraded_rail_cells: usize,
}

pub fn net_counts(sim: &Simulation) -> NetCounts {
    let mut c = NetCounts::default();
    let mut complete: FxHashSet<usize> = FxHashSet::default();
    let mut partial: FxHashSet<usize> = FxHashSet::default();
    let mut legacy: FxHashSet<usize> = FxHashSet::default();
    for edge in &sim.road_net.edges {
        if edge.kind == NetKind::Power {
            c.power += 1;
            continue;
        }
        c.edges += 1;
        if edge.complete() {
            c.complete += 1;
        }
        match edge.grade {
            2 => c.paved += 1,
            1 => c.graded += 1,
            _ => {}
        }
        let set = if edge.dest == Dest::Legacy {
            &mut legacy
        } else if edge.complete() {
            &mut complete
        } else {
            &mut partial
        };
        for &[x, y] in edge.built_cells() {
            if WorldGrid::in_bounds(x, y) {
                set.insert(WorldGrid::idx(x, y));
            }
        }
    }
    let wearing: FxHashSet<usize> = sim
        .road_net
        .wear
        .iter()
        .filter(|w| WorldGrid::in_bounds(w.at[0], w.at[1]))
        .map(|w| WorldGrid::idx(w.at[0], w.at[1]))
        .collect();
    let streets: FxHashSet<usize> = sim
        .towns
        .iter()
        .flat_map(|t| t.reserved_tiles())
        .filter(|&(x, y)| WorldGrid::in_bounds(x, y))
        .map(|(x, y)| WorldGrid::idx(x, y))
        .collect();
    for (i, &road) in sim.grid.road.iter().enumerate() {
        match road {
            ROAD_TRACK | ROAD_BRIDGE => {
                if complete.contains(&i) {
                    c.connecting_cells += 1;
                } else if partial.contains(&i) {
                    c.building_cells += 1;
                } else if legacy.contains(&i) {
                    c.old_road_cells += 1;
                } else if streets.contains(&i) {
                    c.street_cells += 1;
                } else if wearing.contains(&i) {
                    c.wearing_cells += 1;
                } else {
                    c.stub_cells += 1;
                }
            }
            ROAD_RAIL => c.rail_cells += 1,
            _ => {}
        }
    }
    for line in &sim.rail_lines {
        let Some(road) = line.road.and_then(|id| sim.road_net.edge(id)) else {
            continue;
        };
        let corridor: FxHashSet<[i32; 2]> = road.path.iter().copied().collect();
        let track: Vec<[i32; 2]> = std::iter::once(line.a)
            .chain(line.path.iter().copied())
            .filter(|&[x, y]| WorldGrid::in_bounds(x, y) && sim.grid.road_at(x, y) == ROAD_RAIL)
            .collect();
        c.upgraded_rail_cells += track.len();
        c.rail_on_roads += track
            .iter()
            .filter(|&&[x, y]| (-1..=1).any(|dy| (-1..=1).any(|dx| corridor.contains(&[x + dx, y + dy]))))
            .count();
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::civ_tick::town::Town;
    use crate::sim::civ::land::village_roads::VillageRoad;
    use crate::sim::storage::persistence::SaveState;

    const OWNER: &str = "road-builders";
    const PARTNER: &str = "neighbours";

    fn flat(grid: &mut WorldGrid) {
        for y in 60..140 {
            for x in 60..160 {
                grid.set(x, y, Tile::Grass);
                grid.elevation[WorldGrid::idx(x, y)] = 0.5;
                grid.road[WorldGrid::idx(x, y)] = ROAD_NONE;
            }
        }
    }

    fn town(id: u32, lineage: &str, center: [i32; 2]) -> Town {
        Town {
            id,
            lineage: lineage.to_string(),
            center,
            streets: Vec::new(),
            founded_tick: 0,
            planned: false,
            growth: 0,
            ..Default::default()
        }
    }

    fn world() -> Simulation {
        let mut sim = Simulation::new(0x80AD);
        sim.buildings.clear();
        sim.farms.clear();
        sim.rail_lines.clear();
        sim.village_roads.clear();
        sim.towns.clear();
        flat(&mut sim.grid);
        sim.organisms.truncate(24);
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = true;
            o.lineage_id = if i < 12 { OWNER } else { PARTNER }.to_string();
            o.inv_stone = 5;
        }
        sim.towns.push(town(1, OWNER, [80, 100]));
        sim.towns.push(town(2, PARTNER, [140, 100]));
        sim
    }

    fn edge(sim: &mut Simulation, dest: Dest, from: [i32; 2], to: [i32; 2], to_town: Option<u32>) -> u32 {
        let path: Vec<[i32; 2]> = (from[0]..=to[0]).map(|x| [x, from[1]]).collect();
        let id = sim.road_net.next_id.max(1);
        sim.road_net.next_id = id + 1;
        sim.road_net.edges.push(NetEdge {
            id,
            owner: OWNER.to_string(),
            dest,
            from_town: 1,
            to_town,
            from,
            to,
            path,
            last_wanted: sim.tick_count,
            ..Default::default()
        });
        sim.road_net.touched();
        id
    }

    fn finish(sim: &mut Simulation, id: u32) {
        let e = sim.road_net.edges.iter_mut().find(|e| e.id == id).unwrap();
        e.built = e.path.len() as u16;
        for &[x, y] in e.path.clone().iter() {
            sim.grid.road[WorldGrid::idx(x, y)] = ROAD_TRACK;
        }
        sim.road_net.touched();
    }

    #[test]
    fn a_road_keeps_off_buildings_and_fields_and_bridges_a_narrow_river() {
        let mut grid = WorldGrid::new(1);
        flat(&mut grid);
        for y in 60..140 {
            for x in 110..113 {
                grid.set(x, y, Tile::Water);
            }
        }
        let covered: FxHashSet<(i32, i32)> =
            (95..=105).flat_map(|y| (94..=96).map(move |x| (x, y))).collect();
        let fields: FxHashSet<(i32, i32)> = (90..=104)
            .flat_map(|y| (100..=104).map(move |x| (x, y)))
            .collect();
        let path = plan_road_way(&grid, [80, 100], [130, 100], &covered, &fields).expect("a way");
        assert_eq!(path.first(), Some(&[80, 100]));
        assert_eq!(path.last(), Some(&[130, 100]));
        assert!(path.iter().all(|&[x, y]| !covered.contains(&(x, y))));
        assert!(
            path.iter().all(|&[x, y]| !fields.contains(&(x, y))),
            "the road goes round the field"
        );
        let wet = path
            .iter()
            .filter(|&&[x, y]| grid.get(x, y) == Tile::Water)
            .count();
        assert_eq!(wet, 3, "one straight bridge over the river");
    }

    #[test]
    fn a_road_climbs_round_a_hill_rather_than_over_it() {
        let mut grid = WorldGrid::new(1);
        flat(&mut grid);
        for y in 88i32..=112 {
            for x in 88i32..=112 {
                let d = (y - 100).abs().max((x - 100).abs()) as f32;
                grid.elevation[WorldGrid::idx(x, y)] = 0.5 + (12.0 - d) * 0.03;
            }
        }
        let flatland = FxHashSet::default();
        let path = plan_road_way(&grid, [80, 100], [120, 100], &flatland, &flatland).expect("a way");
        assert!(
            !path.contains(&[100, 100]),
            "the road keeps off the top of the hill"
        );
    }

    #[test]
    fn a_road_is_built_a_few_cells_a_pass_and_costs_stone() {
        let mut sim = world();
        let id = edge(&mut sim, Dest::Partner, [80, 100], [140, 100], Some(2));
        let stone = stone_of(&sim, OWNER);
        sim.build_edges();
        let built = sim.road_net.edge(id).unwrap().built;
        assert!((1..=MAX_CELLS_PER_PASS as u16).contains(&built), "built {built}");
        assert_eq!(sim.grid.road_at(81, 100), ROAD_TRACK);
        assert_eq!(
            sim.grid.road_at(120, 100),
            ROAD_NONE,
            "the far end is not laid yet"
        );
        for _ in 0..40 {
            sim.build_edges();
        }
        assert!(sim.road_net.edge(id).unwrap().complete());
        assert!((80..=140).all(|x| sim.grid.road_at(x, 100) == ROAD_TRACK));
        assert!(stone_of(&sim, OWNER) < stone, "the road took stone");
    }

    #[test]
    fn a_road_nobody_needs_fades_back_to_grass_unless_people_walk_it() {
        let mut sim = world();
        let id = edge(&mut sim, Dest::Quarry, [80, 100], [100, 100], None);
        finish(&mut sim, id);
        sim.grid.path_trail[WorldGrid::idx(90, 100)] = 1.0;
        sim.tick_count = UNWANTED_TICKS + 1;
        let living: FxHashSet<String> = [OWNER.to_string(), PARTNER.to_string()].into_iter().collect();
        sim.retire_edges(&living, &[]);
        assert!(sim.road_net.edges.is_empty());
        assert_eq!(sim.grid.road_at(95, 100), ROAD_TRACK, "the track lies a while");
        for _ in 0..WEAR_GONE_PASSES {
            sim.wear_roads();
        }
        assert_eq!(sim.grid.road_at(95, 100), ROAD_NONE, "then it is gone");
        assert_eq!(sim.grid.road_at(90, 100), ROAD_TRACK, "a path people walk stays");
    }

    #[test]
    fn a_busy_road_is_paved_and_a_quiet_one_falls_back_to_a_track() {
        let mut sim = world();
        sim.lineage_eras.insert(OWNER.to_string(), Era::Medieval);
        let id = edge(&mut sim, Dest::Partner, [80, 100], [140, 100], Some(2));
        finish(&mut sim, id);
        let grade = |sim: &Simulation| sim.road_net.edge(id).unwrap().grade;
        sim.road_net.edges[0].traffic = 100 * TRIP;
        sim.grade_roads();
        assert_eq!(grade(&sim), 1, "track to road");
        sim.grade_roads();
        assert_eq!(grade(&sim), 2, "road to paved road");
        assert_eq!(sim.road_net.grades().get(&WorldGrid::idx(100, 100)), Some(&3));
        for _ in 0..80 {
            sim.grade_roads();
        }
        assert_eq!(grade(&sim), 0, "unused, it is a track again");
    }

    #[test]
    fn a_caravan_takes_the_roads_from_town_to_town_in_either_direction() {
        let mut sim = world();
        sim.towns.push(town(3, PARTNER, [140, 130]));
        let id = edge(&mut sim, Dest::Partner, [80, 100], [140, 100], Some(2));
        let far = edge(&mut sim, Dest::Town, [140, 100], [140, 130], Some(3));
        sim.road_net.edges[1].path = (100..=130).map(|y| [140, y]).collect();
        assert!(
            caravan_way(&sim, [80, 100], [140, 100]).is_none(),
            "not until it is built"
        );
        finish(&mut sim, id);
        finish(&mut sim, far);
        let out = caravan_way(&sim, [80, 100], [140, 130]).expect("the roads");
        assert_eq!(out.legs, vec![(id, false), (far, false)]);
        assert_eq!(out.walk, 90);
        let back = caravan_way(&sim, [140, 130], [80, 100]).expect("the roads back");
        assert_eq!(back.legs, vec![(far, true), (id, true)]);
        assert_eq!(point_along(&sim, &back.legs, 0.0), Some([140, 130]));
        assert_eq!(point_along(&sim, &out.legs, 1.0), Some([140, 130]));
        assert_eq!(point_along(&sim, &out.legs, 30.0 / 91.0), Some([110, 100]));
        assert!(
            caravan_way(&sim, [80, 100], [100, 120]).is_none(),
            "off the network"
        );
    }

    #[test]
    fn carts_on_a_road_count_as_traffic() {
        let mut sim = world();
        let id = edge(&mut sim, Dest::Fields, [80, 100], [100, 100], None);
        finish(&mut sim, id);
        sim.tick_count = 900;
        note_route(&mut sim, &[(85, 100), (86, 100), (86, 101)], 1);
        let e = sim.road_net.edge(id).unwrap();
        assert_eq!((e.traffic, e.last_used), (TRIP, 900));
    }

    #[test]
    fn a_power_line_follows_a_road_from_a_town_with_a_plant() {
        let mut sim = world();
        sim.towns.push(town(3, OWNER, [80, 130]));
        let id = edge(&mut sim, Dest::Town, [80, 100], [80, 130], Some(3));
        sim.road_net.edges[0].path = (100..=130).map(|y| [80, y]).collect();
        finish(&mut sim, id);
        sim.sync_power_edges();
        assert!(sim.road_net.edges.iter().all(|e| e.kind == NetKind::Road));
        let mut plant = crate::sim::tech::buildings::Building::new(
            900,
            BuildingKind::PowerPlant,
            84,
            96,
            Some(OWNER.to_string()),
            0,
        );
        plant.condition = 1.0;
        sim.buildings.push(plant);
        sim.sync_power_edges();
        let power: Vec<&NetEdge> = sim
            .road_net
            .edges
            .iter()
            .filter(|e| e.kind == NetKind::Power)
            .collect();
        assert_eq!(power.len(), 1);
        assert_eq!(power[0].path, sim.road_net.edge(id).unwrap().path);
    }

    #[test]
    fn the_network_is_saved_and_an_old_save_turns_village_roads_into_fading_edges() {
        let mut sim = world();
        let id = edge(&mut sim, Dest::Partner, [80, 100], [140, 100], Some(2));
        finish(&mut sim, id);
        let json = serde_json::to_string(&sim.to_save_state()).expect("save state serialises");
        let loaded: SaveState = serde_json::from_str(&json).expect("save state parses");
        let back = Simulation::from_save(0x80AD, loaded);
        assert_eq!(back.road_net, sim.road_net);

        let mut old = world();
        for x in 80..=100 {
            old.grid.road[WorldGrid::idx(x, 100)] = ROAD_TRACK;
        }
        old.village_roads.push(VillageRoad {
            lineage: OWNER.to_string(),
            from: [80, 100],
            to: [100, 100],
        });
        let mut value = serde_json::to_value(old.to_save_state()).expect("save state as a value");
        value.as_object_mut().expect("object").remove("road_net");
        let loaded: SaveState = serde_json::from_value(value).expect("an old save parses");
        let mut back = Simulation::from_save(0x80AD, loaded);
        assert!(back.road_net.edges.is_empty());
        back.migrate_legacy_roads();
        assert!(back.village_roads.is_empty());
        let legacy = &back.road_net.edges[0];
        assert_eq!(legacy.dest, Dest::Legacy);
        assert!(legacy.complete() && legacy.path.len() >= 20);
    }
}
