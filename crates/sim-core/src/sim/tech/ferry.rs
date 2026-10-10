//! Ferries. Where a narrow strait of water (at most `MAX_STRAIT` tiles) cuts off two landmasses
//! whose people are kin, a tribe on one shore sets up a ferry: a boat moored at a landing on each
//! shore. Kin who want to cross walk to the pier and wait (`WAIT_FOR_FERRY`); when the ferry is moored
//! there and they stand by it, they board (up to `FERRY_CAP`), it sails across, and they land on
//! the far shore. A ferry sails only when someone is aboard it, and it holds in storms. Passengers
//! are carried, not steered: `boat_action` answers their turn with a quiet rest while the ferry moves
//! them, and the frame lists them so the client draws them in the boat.
use std::collections::{BTreeMap, HashMap, VecDeque};

use crate::sim::simulation::Simulation;
use crate::sim::transportation::{FerryLine, TransportKind, Vehicle};
use crate::world::{
    grid::{WorldGrid, HEIGHT, WIDTH},
    tiles::Tile,
};

use super::fleet::harbour_shore;

const CARDINAL: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];

/// The journey description of a person walking to a ferry pier.
pub(crate) const WAIT_FOR_FERRY: &str = "going to the ferry to see kin";
/// How often the land is surveyed and a new ferry line is planned, in ticks.
const SURVEY_TICKS: u64 = 200;
/// A ferry moves one tile of water every this many ticks.
const STEP_TICKS: u64 = 3;
/// Widest strait a ferry crosses, in tiles of water.
const MAX_STRAIT: i32 = 8;
/// Narrowest strait worth a ferry, in tiles of water (a one-tile gap is just a step).
const MIN_STRAIT: i32 = 2;
/// Most ferry lines in one world.
const MAX_FERRIES: usize = 8;
/// Most passengers aboard a ferry at once.
const FERRY_CAP: usize = 6;
/// A tribe must have this many members, and a seafaring one, before it sets up a ferry.
const MIN_TRIBE_FOR_FERRY: usize = 6;
/// Most water tiles a ferry's route search visits.
const SEARCH_LIMIT: usize = 1500;
/// How near (in tiles, Chebyshev) a person must stand to a landing to board the ferry there.
const BOARD_REACH: i32 = 2;
/// Ticks a new ferry needs before it is ready to sail.
const BUILD_TICKS: u64 = 24;

/// What the last survey found: the landmass each walkable tile belongs to (`u32::MAX` for water and
/// rock), and for each tribe the landmasses where its members live.
#[derive(Default, Debug, Clone)]
pub(crate) struct FerrySurvey {
    landmass: Vec<u32>,
    kin: BTreeMap<String, Vec<u32>>,
}

/// The landmass beside a water tile (the first dry neighbour), or `u32::MAX`.
fn bank(survey: &FerrySurvey, p: (i32, i32)) -> u32 {
    CARDINAL
        .iter()
        .map(|&(dx, dy)| (p.0 + dx, p.1 + dy))
        .filter(|&(x, y)| WorldGrid::in_bounds(x, y))
        .map(|(x, y)| survey.landmass[WorldGrid::idx(x, y)])
        .find(|&m| m != u32::MAX)
        .unwrap_or(u32::MAX)
}

/// The dry tile a passenger steps onto when a ferry lands at `at`.
fn quay(grid: &WorldGrid, at: (i32, i32)) -> Option<(i32, i32)> {
    harbour_shore(grid, at).map(|(dx, dy)| (at.0 + dx, at.1 + dy))
}

/// The water route from `from` to `to` (both included), breadth first, or `None` when the water does not join them.
fn water_path(grid: &WorldGrid, from: (i32, i32), to: (i32, i32)) -> Option<Vec<(i32, i32)>> {
    let mut parent: HashMap<(i32, i32), (i32, i32)> = HashMap::new();
    let mut queue = VecDeque::from([from]);
    let mut seen = 0usize;
    while let Some(p) = queue.pop_front() {
        if p == to {
            let mut path = vec![p];
            let mut cur = p;
            while let Some(&prev) = parent.get(&cur) {
                path.push(prev);
                cur = prev;
            }
            path.reverse();
            return Some(path);
        }
        seen += 1;
        if seen > SEARCH_LIMIT {
            return None;
        }
        for (dx, dy) in CARDINAL {
            let n = (p.0 + dx, p.1 + dy);
            if !WorldGrid::in_bounds(n.0, n.1) || grid.get(n.0, n.1) != Tile::Water {
                continue;
            }
            if n != from && !parent.contains_key(&n) {
                parent.insert(n, p);
                queue.push_back(n);
            }
        }
    }
    None
}

impl Simulation {
    /// Surveys the land every `SURVEY_TICKS`, plans at most one new ferry line, and walks the people
    /// who need to cross to their pier. Every `STEP_TICKS` the ferries board and sail.
    pub(crate) fn tick_ferries(&mut self) {
        let now = self.tick_count;
        if now.is_multiple_of(SURVEY_TICKS) {
            self.survey_landmasses();
            self.plan_ferries();
            self.send_kin_to_the_pier();
        }
        if now.is_multiple_of(STEP_TICKS) && !self.ferry_survey.landmass.is_empty() {
            self.ferry_step();
        }
    }

    fn survey_landmasses(&mut self) {
        let size = WIDTH * HEIGHT;
        let mut landmass = vec![u32::MAX; size];
        let mut count = 0u32;
        for start in 0..size {
            let (sx, sy) = ((start % WIDTH) as i32, (start / WIDTH) as i32);
            let t = self.grid.get(sx, sy);
            if landmass[start] != u32::MAX || !t.walkable() || t == Tile::Water {
                continue;
            }
            landmass[start] = count;
            let mut queue = VecDeque::from([start]);
            while let Some(i) = queue.pop_front() {
                let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
                for (dx, dy) in CARDINAL {
                    let (nx, ny) = (x + dx, y + dy);
                    if !WorldGrid::in_bounds(nx, ny) {
                        continue;
                    }
                    let ni = WorldGrid::idx(nx, ny);
                    let t = self.grid.get(nx, ny);
                    if landmass[ni] == u32::MAX && t.walkable() && t != Tile::Water {
                        landmass[ni] = count;
                        queue.push_back(ni);
                    }
                }
            }
            count += 1;
        }
        let mut kin: BTreeMap<String, Vec<u32>> = BTreeMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let c = landmass[WorldGrid::idx(o.x as i32, o.y as i32)];
            if c == u32::MAX {
                continue;
            }
            let list = kin.entry(o.lineage_id.clone()).or_default();
            if !list.contains(&c) {
                list.push(c);
            }
        }
        self.ferry_survey = FerrySurvey { landmass, kin };
    }

    /// Finds a strait between two landmasses whose kin live on both sides, and moors a boat at each
    /// shore of it. One line per survey at most.
    fn plan_ferries(&mut self) {
        let survey = &self.ferry_survey;
        let mut wanted: Vec<(u32, u32)> = Vec::new();
        for list in survey.kin.values().filter(|l| l.len() >= 2) {
            for (i, &c1) in list.iter().enumerate() {
                for &c2 in &list[i + 1..] {
                    let pair = (c1.min(c2), c1.max(c2));
                    if !wanted.contains(&pair) {
                        wanted.push(pair);
                    }
                }
            }
        }
        if wanted.is_empty() || self.vehicles.iter().filter(|v| v.ferry.is_some()).count() >= MAX_FERRIES {
            return;
        }
        let existing: Vec<(u32, u32)> = self
            .vehicles
            .iter()
            .filter_map(|v| v.ferry)
            .map(|f| {
                let (c1, c2) = (bank(survey, f.a), bank(survey, f.b));
                (c1.min(c2), c1.max(c2))
            })
            .collect();
        let Some(&(c1, c2)) = wanted.iter().find(|p| !existing.contains(p)) else {
            return;
        };
        // The first straight strait, in tile order, from a shore of `c1` to a shore of `c2`.
        let mut strait: Option<((i32, i32), (i32, i32))> = None;
        'scan: for i in 0..survey.landmass.len() {
            if survey.landmass[i] != c1 && survey.landmass[i] != c2 {
                continue;
            }
            let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            for (dx, dy) in CARDINAL {
                let mut water = 0;
                for k in 1..=MAX_STRAIT {
                    let (px, py) = (x + dx * k, y + dy * k);
                    if !WorldGrid::in_bounds(px, py) {
                        break;
                    }
                    if self.grid.get(px, py) == Tile::Water {
                        water += 1;
                        continue;
                    }
                    let far = survey.landmass[WorldGrid::idx(px, py)];
                    let near = survey.landmass[i];
                    if water >= MIN_STRAIT
                        && far != u32::MAX
                        && near != far
                        && ((near, far) == (c1, c2) || (near, far) == (c2, c1))
                    {
                        strait = Some(((x + dx, y + dy), (x + dx * water, y + dy * water)));
                        break 'scan;
                    }
                    break;
                }
            }
        }
        let Some((a, b)) = strait else { return };
        // The tribe that builds it: a seafaring tribe with kin on both shores.
        let mut owner: Option<String> = None;
        for (lineage, list) in survey.kin.iter() {
            if !(list.contains(&c1) && list.contains(&c2)) {
                continue;
            }
            let members = self
                .organisms
                .iter()
                .filter(|o| o.alive && &o.lineage_id == lineage);
            let mut count = 0usize;
            let mut seafaring = false;
            for o in members {
                count += 1;
                seafaring |= ["fishing", "raft_building", "navigation", "sailing"]
                    .iter()
                    .any(|d| o.discoveries.contains(*d));
            }
            if count >= MIN_TRIBE_FOR_FERRY && seafaring {
                owner = Some(lineage.clone());
                break;
            }
        }
        let Some(owner) = owner else { return };
        if water_path(&self.grid, a, b).is_none() {
            return;
        }
        let now = self.tick_count;
        self.vehicles.push(Vehicle {
            id: self.next_vehicle_id,
            kind: TransportKind::Boat,
            owner_lineage: owner.clone(),
            x: a.0,
            y: a.1,
            occupants: Vec::new(),
            cargo: 0,
            route: Vec::new(),
            ready_tick: now + BUILD_TICKS,
            harbour: None,
            bound_for: None,
            ferry: Some(FerryLine { a, b }),
        });
        self.next_vehicle_id += 1;
        let name = self
            .lineage_names
            .get(&owner)
            .cloned()
            .unwrap_or_else(|| owner.clone());
        crate::sim::world_events::push_event(
            &mut self.events,
            now,
            "discovery",
            &name,
            "moored a ferry at a strait, to carry kin across the water",
        );
    }

    /// People whose kin live across a ferry's strait walk to the pier on their shore and wait there.
    fn send_kin_to_the_pier(&mut self) {
        let now = self.tick_count;
        let ferries: Vec<FerryLine> = self.vehicles.iter().filter_map(|v| v.ferry).collect();
        if ferries.is_empty() {
            return;
        }
        let survey = &self.ferry_survey;
        let mut walks: Vec<(usize, (i32, i32))> = Vec::new();
        for (oi, o) in self.organisms.iter().enumerate() {
            if !o.alive {
                continue;
            }
            let here = survey.landmass[WorldGrid::idx(o.x as i32, o.y as i32)];
            let Some(list) = survey.kin.get(&o.lineage_id) else {
                continue;
            };
            for f in &ferries {
                for (shore, other, at) in [(f.a, f.b, f.a), (f.b, f.a, f.b)] {
                    let (ca, cb) = (bank(survey, shore), bank(survey, other));
                    if here == ca && list.contains(&cb) {
                        if let Some(q) = quay(&self.grid, at) {
                            walks.push((oi, q));
                        }
                    }
                }
            }
        }
        for (oi, q) in walks {
            let o = &mut self.organisms[oi];
            if o.journey
                .as_ref()
                .is_some_and(|j| j.description == WAIT_FOR_FERRY)
            {
                continue;
            }
            o.begin_journey(q, WAIT_FOR_FERRY, now);
        }
    }

    /// Boards the waiting people, sails ferries across, and lands the passengers.
    fn ferry_step(&mut self) {
        let now = self.tick_count;
        let storm = self.weather.kind == 2;
        let lines: Vec<usize> = self
            .vehicles
            .iter()
            .enumerate()
            .filter(|(_, v)| v.ferry.is_some() && now >= v.ready_tick)
            .map(|(i, _)| i)
            .collect();
        if lines.is_empty() {
            return;
        }
        let survey = &self.ferry_survey;
        // Everyone standing by a landing, by ferry and side.
        let mut near: Vec<(usize, usize, usize)> = Vec::new();
        for (oi, o) in self.organisms.iter().enumerate() {
            if !o.alive
                || !o
                    .journey
                    .as_ref()
                    .is_some_and(|j| j.description == WAIT_FOR_FERRY)
            {
                continue;
            }
            for &vi in &lines {
                let f = self.vehicles[vi]
                    .ferry
                    .unwrap_or(FerryLine { a: (0, 0), b: (0, 0) });
                for (side, at) in [f.a, f.b].into_iter().enumerate() {
                    if (o.x as i32 - at.0).abs().max((o.y as i32 - at.1).abs()) <= BOARD_REACH {
                        near.push((vi, side, oi));
                    }
                }
            }
        }
        // Whoever is aboard any ferry, by id.
        let mut riding: BTreeMap<String, (i32, i32)> = BTreeMap::new();
        let mut landed: BTreeMap<String, (i32, i32)> = BTreeMap::new();
        for &vi in &lines {
            let Some(f) = self.vehicles[vi].ferry else {
                continue;
            };
            let other_of = |side: usize| if side == 0 { f.b } else { f.a };
            if !self.vehicles[vi].route.is_empty() {
                if storm {
                    continue;
                }
                let next = self.vehicles[vi]
                    .route
                    .pop()
                    .unwrap_or((self.vehicles[vi].x, self.vehicles[vi].y));
                self.vehicles[vi].x = next.0;
                self.vehicles[vi].y = next.1;
                if self.vehicles[vi].route.is_empty() {
                    // Landed: everyone aboard steps ashore on this side.
                    let shore = quay(&self.grid, next).unwrap_or(next);
                    for id in std::mem::take(&mut self.vehicles[vi].occupants) {
                        landed.insert(id, shore);
                    }
                } else {
                    for id in &self.vehicles[vi].occupants {
                        riding.insert(id.clone(), next);
                    }
                }
                continue;
            }
            let here = (self.vehicles[vi].x, self.vehicles[vi].y);
            let side = if here == f.a {
                0
            } else if here == f.b {
                1
            } else {
                continue;
            };
            if storm {
                continue;
            }
            let other = other_of(side);
            let bank_here = bank(survey, here);
            let bank_there = bank(survey, other);
            let wants = |oi: usize| -> bool {
                let o = &self.organisms[oi];
                o.alive
                    && survey.landmass[WorldGrid::idx(o.x as i32, o.y as i32)]
                        == if side == 0 { bank_here } else { bank_there }
                    && survey
                        .kin
                        .get(&o.lineage_id)
                        .is_some_and(|l| l.contains(if side == 0 { &bank_there } else { &bank_here }))
            };
            let room = FERRY_CAP.saturating_sub(self.vehicles[vi].occupants.len());
            let mut boarding: Vec<usize> = Vec::new();
            for &(nvi, nside, oi) in &near {
                if nvi != vi || nside != side || boarding.len() >= room || !wants(oi) {
                    continue;
                }
                let id = &self.organisms[oi].id;
                let aboard = self
                    .vehicles
                    .iter()
                    .any(|v| v.ferry.is_some() && v.occupants.contains(id));
                if !aboard && !boarding.contains(&oi) {
                    boarding.push(oi);
                }
            }
            let other_waits = near.iter().any(|&(nvi, nside, oi)| {
                nvi == vi
                    && nside != side
                    && wants_other(&self.organisms, oi, survey, bank_here, bank_there, nside)
            });
            if boarding.is_empty() && !other_waits {
                continue;
            }
            let Some(mut path) = water_path(&self.grid, here, other) else {
                continue;
            };
            path.remove(0);
            path.reverse();
            self.vehicles[vi].route = path;
            for oi in boarding {
                let o = &mut self.organisms[oi];
                o.journey = None;
                o.wander_target = None;
                o.x = here.0 as f32;
                o.y = here.1 as f32;
                let id = o.id.clone();
                self.vehicles[vi].occupants.push(id);
            }
        }
        if riding.is_empty() && landed.is_empty() {
            return;
        }
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if let Some(&(x, y)) = riding.get(&o.id) {
                o.x = x as f32;
                o.y = y as f32;
            } else if let Some(&(x, y)) = landed.get(&o.id) {
                o.x = x as f32;
                o.y = y as f32;
                o.journey = None;
                o.wander_target = None;
            }
        }
    }
}

/// Whether the person at `oi` on the far side of a strait waits to be carried back over it.
fn wants_other(
    organisms: &[crate::organism::organism::Organism],
    oi: usize,
    survey: &FerrySurvey,
    bank_here: u32,
    bank_there: u32,
    side: usize,
) -> bool {
    let o = &organisms[oi];
    let on = if side == 0 { bank_here } else { bank_there };
    let across = if side == 0 { bank_there } else { bank_here };
    o.alive
        && survey.landmass[WorldGrid::idx(o.x as i32, o.y as i32)] == on
        && survey.kin.get(&o.lineage_id).is_some_and(|l| l.contains(&across))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Two islands of grass, rock all round, and a four-tile strait between them. Eight people of one
    /// tribe (four on each island), all seafaring.
    fn strait_world() -> Simulation {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        for y in 80..=120 {
            for x in 80..=130 {
                sim.grid.set(x, y, Tile::Rock);
            }
        }
        for y in 90..=110 {
            for x in 85..=95 {
                sim.grid.set(x, y, Tile::Grass);
            }
            for x in 96..=99 {
                sim.grid.set(x, y, Tile::Water);
            }
            for x in 100..=110 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        assert!(sim.organisms.len() >= 8);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        for (i, o) in sim.organisms.iter_mut().take(8).enumerate() {
            o.alive = true;
            o.lineage_id = "kin".to_string();
            o.x = if i < 4 {
                88.0 + i as f32
            } else {
                104.0 + (i - 4) as f32
            };
            o.y = 100.0;
            o.discover("fishing");
        }
        sim.tick_count = 200;
        sim
    }

    #[test]
    fn a_ferry_carries_kin_across_a_strait_and_lands_them_on_the_far_shore() {
        let mut sim = strait_world();
        sim.tick_ferries();
        assert_eq!(sim.vehicles.len(), 1, "a ferry is moored at the strait");
        let line = sim.vehicles[0].ferry.expect("a ferry line");
        assert_eq!((line.a, line.b), ((96, 90), (99, 90)));
        assert!(sim.organisms[0]
            .journey
            .as_ref()
            .is_some_and(|j| j.description == WAIT_FOR_FERRY));
        // They walk to the piers (the test does not run the walk itself).
        for (i, o) in sim.organisms.iter_mut().take(8).enumerate() {
            o.x = if i < 4 { 95.0 } else { 100.0 };
            o.y = 90.0;
        }
        let frame = sim.state_json();
        assert_eq!(frame["vehicles"][0]["ferry"].as_array().map(|a| a.len()), Some(2));

        let mut boarded = false;
        let mut sailed = false;
        for t in 201..=520 {
            sim.tick_count = t;
            sim.tick_ferries();
            let v = &sim.vehicles[0];
            if !v.occupants.is_empty() {
                boarded = true;
                let id = v.occupants[0].clone();
                let rider = sim
                    .organisms
                    .iter()
                    .position(|o| o.id == id)
                    .expect("rider exists");
                let (_, thought, origin) = sim.boat_action(rider).expect("a passenger rides");
                assert_eq!(origin, "ferry_ride");
                assert!(thought.is_some());
            }
            if !sim.vehicles[0].route.is_empty() {
                sailed = true;
            }
        }
        assert!(boarded && sailed, "kin board the ferry and it sails");
        let v = &sim.vehicles[0];
        assert!(v.occupants.is_empty(), "every passenger landed");
        assert_eq!((v.x, v.y), (99, 90), "the ferry came to rest at the far landing");
        let far_side = sim.organisms.iter().filter(|o| o.alive && o.x >= 100.0).count();
        assert!(
            far_side >= 4,
            "the crossing moved people to the far shore, found {far_side}"
        );
    }

    #[test]
    fn a_ferry_holds_in_a_storm() {
        let mut sim = strait_world();
        sim.tick_ferries();
        for t in 201..=260 {
            sim.tick_count = t;
            sim.weather.kind = 2;
            sim.tick_ferries();
        }
        assert!(sim.vehicles[0].occupants.is_empty());
        assert_eq!((sim.vehicles[0].x, sim.vehicles[0].y), (96, 90));
    }
}
