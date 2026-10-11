//! Ferries. Where a narrow strait of water (at most `MAX_STRAIT` tiles) cuts off two landmasses
//! whose people are kin, a tribe on one shore sets up a ferry: a boat moored at a landing on each
//! shore. A person whose errand takes them across the water (a journey whose goal lies on the far
//! shore, which no road reaches) walks to the nearest pier that carries that crossing and joins its
//! queue. A pier queues at most two boatloads; anyone who finds it full goes on with their own life
//! and may try again later. When the ferry is moored there and a queued person stands on the quay,
//! they board (up to `FERRY_CAP`), it sails across, and they land on the far shore and carry on to
//! where they were going. A ferry sails only when someone waits for it, and it holds in storms.
//! Passengers are carried, not steered: `boat_action` answers their turn with a quiet rest while the
//! ferry moves them, and the frame lists them so the client draws them in the boat.
use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};

use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;
use crate::sim::transportation::{FerryLine, TransportKind, Vehicle};
use crate::world::{
    grid::{WorldGrid, HEIGHT, WIDTH},
    tiles::Tile,
};

use super::fleet::harbour_shore;

const CARDINAL: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];

/// The journey description of a person walking to a ferry pier.
pub(crate) const WAIT_FOR_FERRY: &str = "going to the ferry";
/// How often the land is surveyed and a new ferry line is planned, in ticks.
const SURVEY_TICKS: u64 = 200;
/// A ferry moves one tile of water every this many ticks; the piers are served on the same beat.
const STEP_TICKS: u64 = 3;
/// Widest strait a ferry crosses, in tiles of water.
const MAX_STRAIT: i32 = 8;
/// Narrowest strait worth a ferry, in tiles of water (a one-tile gap is just a step).
const MIN_STRAIT: i32 = 2;
/// Most ferry lines in one world.
const MAX_FERRIES: usize = 8;
/// Most passengers aboard a ferry at once.
const FERRY_CAP: usize = 6;
/// Most people queued at one pier: about two boatloads, so a boat finds people on the quay when it
/// comes in, and a pier never holds a crowd.
const QUEUE_CAP: usize = 2 * FERRY_CAP;
/// How long someone queues at a pier for the boat before giving up, in ticks.
const PATIENCE_TICKS: u64 = 600;
/// How long someone who gave up waits before they may queue at a pier again, in ticks.
const COOLDOWN_TICKS: u64 = 600;
/// A tribe must have this many members, and a seafaring one, before it sets up a ferry.
const MIN_TRIBE_FOR_FERRY: usize = 6;
/// Most water tiles a ferry's route search visits.
const SEARCH_LIMIT: usize = 1500;
/// How near (in tiles, Chebyshev) a person must stand to the quay to board, or to count as on it.
/// The same reach ends a walk to the quay, so a person who arrives is on the quay.
const BOARD_REACH: i32 = 2;
/// Ticks a new ferry needs before it is ready to sail.
const BUILD_TICKS: u64 = 24;

/// What the last survey found: the landmass each walkable tile belongs to (`u32::MAX` for water and
/// rock), and for each tribe the landmasses where its members live (the tribes a ferry is planned for).
#[derive(Default, Debug, Clone)]
pub(crate) struct FerrySurvey {
    landmass: Vec<u32>,
    kin: BTreeMap<String, Vec<u32>>,
}

/// A person in a pier's queue or aboard a ferry, and the errand that brought them to the water.
#[derive(Clone, Debug)]
pub(crate) struct Passenger {
    /// Where the person stood in `Simulation::organisms` when last checked (see `locate`).
    idx: usize,
    id: String,
    /// Where the journey they joined the queue on was taking them, and what it was called.
    goal: (i32, i32),
    description: String,
    /// The tick they joined the queue.
    since: u64,
}

/// The ferry queues. They are not saved: the errands are, through the people's journeys.
/// `piers` holds, per pier (a ferry's id and side, 0 at its `a` landing and 1 at `b`), the people
/// queued for it in the order they joined. `aboard` holds, per ferry, the passengers it carries.
#[derive(Default, Debug, Clone)]
pub(crate) struct FerryQueues {
    piers: BTreeMap<(u32, usize), Vec<Passenger>>,
    aboard: BTreeMap<u32, Vec<Passenger>>,
    /// Ticks until which a person who gave up waiting may not queue again.
    cooldown: BTreeMap<String, u64>,
}

/// One pier: a ferry's landing on one shore, the dry quay beside it, and the landmasses it joins.
#[derive(Clone, Copy, Debug)]
struct Pier {
    vehicle: u32,
    side: usize,
    quay: (i32, i32),
    /// The landmass of this shore, and of the shore across.
    here: u32,
    there: u32,
}

/// Where a passenger stepped ashore, and the errand they were on when they boarded.
struct Landing {
    shore: (i32, i32),
    bank: u32,
    errand: Option<((i32, i32), String)>,
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

/// Chebyshev distance between two tiles.
fn reach(a: (i32, i32), b: (i32, i32)) -> i32 {
    (a.0 - b.0).abs().max((a.1 - b.1).abs())
}

/// The tile a person stands on.
fn tile_of(o: &Organism) -> (i32, i32) {
    (o.x as i32, o.y as i32)
}

/// Whether a queued passenger is still alive and stands on the quay.
fn on_quay(organisms: &[Organism], p: &Passenger, quay: (i32, i32)) -> bool {
    organisms
        .get(p.idx)
        .is_some_and(|o| o.alive && o.id == p.id && reach(tile_of(o), quay) <= BOARD_REACH)
}

/// Finds a passenger among the organisms, refreshing the index they were last seen at.
fn locate(organisms: &[Organism], p: &mut Passenger) -> Option<usize> {
    if organisms.get(p.idx).is_some_and(|o| o.alive && o.id == p.id) {
        return Some(p.idx);
    }
    let found = organisms.iter().position(|o| o.alive && o.id == p.id)?;
    p.idx = found;
    Some(found)
}

/// Every pier of every ferry line whose two shores are both known, in ferry order.
fn piers_of(grid: &WorldGrid, survey: &FerrySurvey, vehicles: &[Vehicle]) -> Vec<Pier> {
    let mut out = Vec::new();
    for v in vehicles {
        let Some(f) = v.ferry else {
            continue;
        };
        for (side, at, other) in [(0, f.a, f.b), (1, f.b, f.a)] {
            let Some(dock) = quay(grid, at) else {
                continue;
            };
            let (here, there) = (bank(survey, at), bank(survey, other));
            if here == u32::MAX || there == u32::MAX || here == there {
                continue;
            }
            out.push(Pier {
                vehicle: v.id,
                side,
                quay: dock,
                here,
                there,
            });
        }
    }
    out
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
    /// Surveys the land every `SURVEY_TICKS` and plans at most one new ferry line. Every `STEP_TICKS`
    /// the queues are kept, the ferries board and sail, and the people who need to cross join a queue.
    pub(crate) fn tick_ferries(&mut self) {
        let now = self.tick_count;
        if now.is_multiple_of(SURVEY_TICKS) {
            self.survey_landmasses();
            self.plan_ferries();
        }
        if now.is_multiple_of(STEP_TICKS) && !self.ferry_survey.landmass.is_empty() {
            self.drop_stale_passengers();
            self.board_and_sail();
            self.admit_passengers();
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
            "moored a ferry at a strait, to carry people across the water",
        );
    }

    /// Takes off the queues anyone who has died or has waited too long for the boat. Those who gave
    /// up go back to their own lives, and may not queue again for a while.
    fn drop_stale_passengers(&mut self) {
        let now = self.tick_count;
        let organisms = &mut self.organisms;
        let queues = &mut self.ferry_queues;
        queues.cooldown.retain(|_, until| *until > now);
        for queue in queues.piers.values_mut() {
            let mut kept = Vec::with_capacity(queue.len());
            for mut p in std::mem::take(queue) {
                let Some(oi) = locate(organisms, &mut p) else {
                    continue;
                };
                if now.saturating_sub(p.since) <= PATIENCE_TICKS {
                    kept.push(p);
                    continue;
                }
                let o = &mut organisms[oi];
                if o.journey
                    .as_ref()
                    .is_some_and(|j| j.description == WAIT_FOR_FERRY)
                {
                    o.journey = None;
                    o.wander_target = None;
                }
                queues.cooldown.insert(p.id, now + COOLDOWN_TICKS);
            }
            *queue = kept;
        }
    }

    /// Boards the queued people who stand on the quay of a moored ferry, sails ferries across when
    /// someone is waiting on either shore, and lands the passengers.
    fn board_and_sail(&mut self) {
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
        let grid = &self.grid;
        // Passengers still on the water, by id, and the landings they step ashore at.
        let mut riding: BTreeMap<String, (i32, i32)> = BTreeMap::new();
        let mut landed: BTreeMap<String, Landing> = BTreeMap::new();
        for &vi in &lines {
            let Some(f) = self.vehicles[vi].ferry else {
                continue;
            };
            let vid = self.vehicles[vi].id;
            if !self.vehicles[vi].route.is_empty() {
                if storm {
                    continue;
                }
                let here = (self.vehicles[vi].x, self.vehicles[vi].y);
                let next = self.vehicles[vi].route.pop().unwrap_or(here);
                self.vehicles[vi].x = next.0;
                self.vehicles[vi].y = next.1;
                if self.vehicles[vi].route.is_empty() {
                    // Landed: everyone aboard steps ashore on this side, and carries on with their errand.
                    let shore = quay(grid, next).unwrap_or(next);
                    let bank = survey.landmass[WorldGrid::idx(shore.0, shore.1)];
                    let riders = self.ferry_queues.aboard.remove(&vid).unwrap_or_default();
                    for id in std::mem::take(&mut self.vehicles[vi].occupants) {
                        let errand = riders
                            .iter()
                            .find(|p| p.id == id)
                            .map(|p| (p.goal, p.description.clone()));
                        landed.insert(id, Landing { shore, bank, errand });
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
            let other = if side == 0 { f.b } else { f.a };
            let (Some(dock), Some(other_dock)) = (quay(grid, here), quay(grid, other)) else {
                continue;
            };
            // Who boards: the people queued here who stand on the quay, first in line first, up to the room aboard.
            let room = FERRY_CAP.saturating_sub(self.vehicles[vi].occupants.len());
            let mut take: Vec<usize> = Vec::new();
            if let Some(queue) = self.ferry_queues.piers.get(&(vid, side)) {
                for (k, p) in queue.iter().enumerate() {
                    if take.len() >= room {
                        break;
                    }
                    if on_quay(&self.organisms, p, dock) {
                        take.push(k);
                    }
                }
            }
            let other_waits = self
                .ferry_queues
                .piers
                .get(&(vid, 1 - side))
                .is_some_and(|q| q.iter().any(|p| on_quay(&self.organisms, p, other_dock)));
            if take.is_empty() && !other_waits {
                continue;
            }
            let Some(mut path) = water_path(grid, here, other) else {
                continue;
            };
            path.remove(0);
            path.reverse();
            self.vehicles[vi].route = path;
            if take.is_empty() {
                continue;
            }
            let mut boarded: Vec<Passenger> = Vec::with_capacity(take.len());
            if let Some(queue) = self.ferry_queues.piers.get_mut(&(vid, side)) {
                for &k in take.iter().rev() {
                    boarded.push(queue.remove(k));
                }
            }
            boarded.reverse();
            for p in boarded {
                let o = &mut self.organisms[p.idx];
                o.journey = None;
                o.wander_target = None;
                o.x = here.0 as f32;
                o.y = here.1 as f32;
                self.vehicles[vi].occupants.push(o.id.clone());
                self.ferry_queues.aboard.entry(vid).or_default().push(p);
            }
        }
        if riding.is_empty() && landed.is_empty() {
            return;
        }
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if let Some(&(x, y)) = riding.get(&o.id) {
                o.x = x as f32;
                o.y = y as f32;
            } else if let Some(l) = landed.get(&o.id) {
                o.x = l.shore.0 as f32;
                o.y = l.shore.1 as f32;
                o.journey = None;
                o.wander_target = None;
                if let Some((goal, description)) = &l.errand {
                    if WorldGrid::in_bounds(goal.0, goal.1)
                        && survey.landmass[WorldGrid::idx(goal.0, goal.1)] == l.bank
                    {
                        o.begin_journey(*goal, description, now);
                    }
                }
            }
        }
    }

    /// Queues the people whose errand takes them across a ferry's strait, at the nearest pier that
    /// carries them and that has room, and walks each queued person back to the quay if they have
    /// strayed from it. A person who finds no room keeps their own journey.
    fn admit_passengers(&mut self) {
        let now = self.tick_count;
        let piers = piers_of(&self.grid, &self.ferry_survey, &self.vehicles);
        if piers.is_empty() {
            return;
        }
        let survey = &self.ferry_survey;
        let mut fill: Vec<usize> = piers
            .iter()
            .map(|p| {
                self.ferry_queues
                    .piers
                    .get(&(p.vehicle, p.side))
                    .map_or(0, |q| q.len())
            })
            .collect();
        let queued: BTreeSet<&str> = self
            .ferry_queues
            .piers
            .values()
            .flatten()
            .map(|p| p.id.as_str())
            .collect();
        let mut joins: Vec<(usize, usize, (i32, i32), String)> = Vec::new();
        let mut refused: Vec<usize> = Vec::new();
        for (oi, o) in self.organisms.iter().enumerate() {
            if !o.alive || queued.contains(o.id.as_str()) {
                continue;
            }
            let Some(journey) = &o.journey else {
                continue;
            };
            let here = survey.landmass[WorldGrid::idx(o.x as i32, o.y as i32)];
            if here == u32::MAX || !WorldGrid::in_bounds(journey.target.0, journey.target.1) {
                continue;
            }
            let there = survey.landmass[WorldGrid::idx(journey.target.0, journey.target.1)];
            if there == u32::MAX || there == here {
                continue;
            }
            // The errand is refused for now when this person is cooling off, or every pier that carries
            // it is full. A refused errand is dropped, so the person goes on with their life and is not
            // stalled at the shore by a walk that cannot end there.
            let cooling = self
                .ferry_queues
                .cooldown
                .get(&o.id)
                .is_some_and(|&until| now < until);
            let carried = piers
                .iter()
                .enumerate()
                .filter(|(_, p)| p.here == here && p.there == there)
                .map(|(pi, _)| pi)
                .collect::<Vec<usize>>();
            let pick = if cooling {
                None
            } else {
                carried
                    .iter()
                    .copied()
                    .filter(|&pi| fill[pi] < QUEUE_CAP)
                    .min_by_key(|&pi| {
                        (
                            reach(tile_of(o), piers[pi].quay),
                            piers[pi].vehicle,
                            piers[pi].side,
                        )
                    })
            };
            let Some(pi) = pick else {
                if cooling || !carried.is_empty() {
                    refused.push(oi);
                }
                continue;
            };
            fill[pi] += 1;
            joins.push((oi, pi, journey.target, journey.description.clone()));
        }
        drop(queued);
        for oi in refused {
            let o = &mut self.organisms[oi];
            o.journey = None;
            o.wander_target = None;
        }
        for (oi, pi, goal, description) in joins {
            let pier = piers[pi];
            let o = &mut self.organisms[oi];
            o.begin_journey(pier.quay, WAIT_FOR_FERRY, now);
            // A walk the person may not make (the quay is walled off to them) leaves their own journey in place.
            if o.journey.as_ref().is_none_or(|j| j.description != WAIT_FOR_FERRY) {
                continue;
            }
            let passenger = Passenger {
                idx: oi,
                id: o.id.clone(),
                goal,
                description,
                since: now,
            };
            self.ferry_queues
                .piers
                .entry((pier.vehicle, pier.side))
                .or_default()
                .push(passenger);
        }
        // A queued person is either walking to the quay or standing on it. One who has gone off about
        // their own life leaves the queue: they are not pulled back, so nobody is held from their work.
        for pier in &piers {
            let Some(queue) = self.ferry_queues.piers.get_mut(&(pier.vehicle, pier.side)) else {
                continue;
            };
            let organisms = &self.organisms;
            queue.retain_mut(|p| {
                let Some(oi) = locate(organisms, p) else {
                    return false;
                };
                let o = &organisms[oi];
                let walking = o
                    .journey
                    .as_ref()
                    .is_some_and(|j| j.description == WAIT_FOR_FERRY);
                walking || reach(tile_of(o), pier.quay) <= BOARD_REACH
            });
        }
    }
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
            o.journey = None;
            o.wander_target = None;
        }
        sim.tick_count = 200;
        sim
    }

    /// Runs the ferries from `from` to `to` (inclusive), one tick at a time.
    fn run(sim: &mut Simulation, from: u64, to: u64) {
        for t in from..=to {
            sim.tick_count = t;
            sim.tick_ferries();
        }
    }

    #[test]
    fn a_traveller_queues_at_the_pier_boards_when_the_boat_comes_and_lands_on_the_far_shore() {
        let mut sim = strait_world();
        for o in sim.organisms.iter_mut().take(4) {
            o.begin_journey((105, 100), "exploring distant land", 200);
        }
        sim.tick_count = 200;
        sim.tick_ferries();
        assert_eq!(sim.vehicles.len(), 1, "a ferry is moored at the strait");
        let line = sim.vehicles[0].ferry.expect("a ferry line");
        assert_eq!((line.a, line.b), ((96, 90), (99, 90)));
        run(&mut sim, 201, 204);
        let vid = sim.vehicles[0].id;
        assert_eq!(
            sim.ferry_queues.piers.get(&(vid, 0)).map(|q| q.len()),
            Some(4),
            "the four who need the far shore queue at its pier"
        );
        for o in sim.organisms.iter().take(4) {
            assert!(o
                .journey
                .as_ref()
                .is_some_and(|j| j.description == WAIT_FOR_FERRY && j.target == (95, 90)));
        }
        // The walk to the quay is not run here: they arrive, which clears the walk.
        for o in sim.organisms.iter_mut().take(4) {
            o.x = 95.0;
            o.y = 90.0;
            o.journey = None;
        }
        let mut boarded = false;
        let mut sailed = false;
        for t in 205..=520 {
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
        assert!(
            boarded && sailed,
            "the queued people board the ferry and it sails"
        );
        let v = &sim.vehicles[0];
        assert!(v.occupants.is_empty(), "every passenger landed");
        assert_eq!((v.x, v.y), (99, 90), "the ferry came to rest at the far landing");
        for o in sim.organisms.iter().take(4) {
            assert!(o.x >= 100.0, "landed on the far shore, at x {}", o.x);
            assert_eq!(
                o.journey.as_ref().map(|j| j.target),
                Some((105, 100)),
                "a passenger carries on with the errand that brought them to the water"
            );
        }
    }

    #[test]
    fn a_full_pier_queue_leaves_the_rest_to_their_own_lives() {
        let mut sim = strait_world();
        // Sixteen more people on the west shore: with the four already there, twenty want the far shore.
        for (k, o) in sim.organisms.iter_mut().filter(|o| !o.alive).take(16).enumerate() {
            o.alive = true;
            o.lineage_id = "kin".to_string();
            o.discover("fishing");
            o.journey = None;
            o.wander_target = None;
            o.x = 86.0 + (k % 8) as f32;
            o.y = 95.0 + (k / 8) as f32;
        }
        for o in sim.organisms.iter_mut().filter(|o| o.alive && o.x < 100.0) {
            o.begin_journey((105, 100), "exploring distant land", 200);
        }
        let living_west = sim.organisms.iter().filter(|o| o.alive && o.x < 100.0).count();
        assert_eq!(living_west, 20);
        sim.tick_count = 200;
        sim.tick_ferries();
        run(&mut sim, 201, 204);
        let vid = sim.vehicles[0].id;
        assert_eq!(
            sim.ferry_queues.piers.get(&(vid, 0)).map(|q| q.len()),
            Some(QUEUE_CAP),
            "a pier queues about two boatloads"
        );
        let waiting = sim
            .organisms
            .iter()
            .filter(|o| {
                o.alive
                    && o.journey
                        .as_ref()
                        .is_some_and(|j| j.description == WAIT_FOR_FERRY)
            })
            .count();
        assert_eq!(waiting, QUEUE_CAP, "only the queued walk to the pier");
        // Those who find no room give up the crossing for now and go on with their own life.
        let refused_and_free = sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.x < 100.0 && o.journey.is_none())
            .count();
        assert_eq!(
            refused_and_free,
            20 - QUEUE_CAP,
            "the rest are free to carry on with their lives"
        );
    }

    #[test]
    fn people_with_no_errand_across_the_water_do_not_walk_to_the_pier() {
        let mut sim = strait_world();
        sim.tick_count = 200;
        sim.tick_ferries();
        run(&mut sim, 201, 600);
        assert_eq!(sim.vehicles.len(), 1, "the ferry is moored");
        assert!(sim.ferry_queues.piers.values().all(|q| q.is_empty()));
        assert!(sim
            .organisms
            .iter()
            .filter(|o| o.alive)
            .all(|o| o.journey.is_none()));
    }

    #[test]
    fn someone_who_waits_too_long_gives_up_and_may_not_queue_again_at_once() {
        let mut sim = strait_world();
        sim.organisms[0].begin_journey((105, 100), "exploring distant land", 200);
        let id = sim.organisms[0].id.clone();
        sim.tick_count = 200;
        sim.tick_ferries();
        run(&mut sim, 201, 204);
        assert!(sim.organisms[0]
            .journey
            .as_ref()
            .is_some_and(|j| j.description == WAIT_FOR_FERRY));
        // Nobody comes to fetch the boat: the walk never ends, and the patience runs out.
        let gave_up = 204 + PATIENCE_TICKS + 3;
        sim.organisms[0].x = 88.0;
        sim.organisms[0].y = 100.0;
        run(&mut sim, 205, gave_up);
        let vid = sim.vehicles[0].id;
        assert!(sim
            .ferry_queues
            .piers
            .get(&(vid, 0))
            .is_some_and(|q| q.is_empty()));
        assert!(sim.organisms[0].journey.is_none(), "back to their own life");
        assert!(sim.ferry_queues.cooldown.contains_key(&id));
        // Their errand still takes them across, but they may not queue again until the cooldown ends:
        // while they cool off, the errand is refused and dropped, so they go on with their life.
        sim.organisms[0].begin_journey((105, 100), "exploring distant land", gave_up);
        run(&mut sim, gave_up + 1, gave_up + 30);
        assert!(sim
            .ferry_queues
            .piers
            .get(&(vid, 0))
            .is_some_and(|q| q.is_empty()));
        assert!(sim.organisms[0].journey.is_none(), "refused while cooling off");
        // The cooldown ends: the same errand is taken up again and they queue once more.
        let cooled = gave_up + COOLDOWN_TICKS;
        run(&mut sim, gave_up + 31, cooled - 1);
        sim.organisms[0].begin_journey((105, 100), "exploring distant land", cooled);
        run(&mut sim, cooled, cooled + 3);
        assert!(
            sim.ferry_queues
                .piers
                .get(&(vid, 0))
                .is_some_and(|q| q.iter().any(|p| p.id == id)),
            "after the cooldown they queue again"
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
