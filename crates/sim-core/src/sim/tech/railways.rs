//! At each station the train unloads, then loads. Grain goes from the stores that hold more to the stores
//! that hold less. People who are waiting on the platform ride to the other end: each station calls on the
//! townsfolk who live near it (of its own town) to come and wait for the next train.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::hashing::FxHashSet;
use crate::organism::organism::Organism;
use crate::sim::civ::land::village_roads::plan_road_avoiding;
use crate::sim::civ::land::village_stores::{fits, OccupiedMap, GRANARY_CAP};
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::sim::tech::ports::WAREHOUSE_CAP;
use crate::sim::transportation::{TransportKind, Vehicle};
use crate::world::grid::{TrailKind, WorldGrid, ROAD_NONE, ROAD_RAIL};

/// Ticks between passes that look for a new line.
pub(crate) const RAIL_STEP: u64 = 400;
/// Ticks between train moves: one tile per `TRAIN_STEP_TICKS` ticks.
pub(crate) const TRAIN_STEP_TICKS: u64 = 2;
/// The era a tribe must have reached to lay track.
const RAIL_ERA: Era = Era::Industrial;
/// Shortest and longest distance between two ends of a line (Chebyshev, in tiles).
const MIN_RAIL: i32 = 10;
const MAX_RAIL: i32 = 80;
/// Longest track a line may be, in tiles.
const MAX_PATH: usize = 110;
/// The share of a line's tiles that must be a busy way (a road, or a path people have trodden) for the line
/// to be laid, and the trodden strength a bare path needs to count (walkers leave 0.06 a step).
const BUSY_SHARE: f32 = 0.4;
pub(crate) const BUSY_TRAIL: f32 = 0.3;
const MAX_LINES_PER_TRIBE: usize = 3;
const MAX_LINES: usize = 16;
/// Path searches one pass may run.
const PLANS_PER_PASS: usize = 12;
/// How far from a town's centre its station is raised, in tiles.
const STATION_RING: i32 = 6;
const STOP_REACH: i32 = 6;
const STOP_DWELL_TICKS: u64 = 16;
const CORRIDOR: i32 = 1;
/// Ticks a train waits at a station after it arrives.
const DWELL_TICKS: u64 = 40;
/// Ticks a train waits when one of its stations is no longer operational.
const STALLED_TICKS: u64 = 300;
const TRAIN_CAP_PEOPLE: usize = 6;
/// Grain a train carries in one trip, in measures.
const TRAIN_CAP_GOODS: u32 = 24;
/// Stores must differ by this much before a train takes grain across.
const GOODS_MARGIN: u32 = 10;
/// How far a station calls its townsfolk from, and how many it calls at each departure.
const CALL_REACH: i32 = 8;
const CALL_MAX: usize = 2;
/// How near a person must stand to board, in tiles.
const BOARD_REACH: i32 = 2;
/// How far a town's stores reach from its station, in tiles.
const TOWN_REACH: i32 = 12;
/// The journey a person takes to the platform to ride the next train.
pub(crate) const WAIT_FOR_TRAIN: &str = "waiting for the train to ride";

/// A line of track between two towns. `lineage` is the tribe that laid it and runs its train; `towns` names
/// the tribe whose town stands at each end (`a` and `b`). `path` runs from `a` (not included) to `b`
/// (included), in order.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RailLine {
    pub id: u32,
    pub lineage: String,
    #[serde(default)]
    pub towns: [String; 2],
    pub a: [i32; 2],
    pub b: [i32; 2],
    pub path: Vec<[i32; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub road: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stops: Vec<[i32; 2]>,
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

fn near(p: (f32, f32), at: [i32; 2], reach: i32) -> bool {
    (p.0 as i32 - at[0]).abs().max((p.1 as i32 - at[1]).abs()) <= reach
}

/// The stop of a station: the middle of the cells below its footprint.
pub(crate) fn stop_of(b: &Building) -> [i32; 2] {
    let (fw, fh) = b.kind.footprint();
    [b.x + i32::from(fw) / 2, b.y + i32::from(fh)]
}

/// The stop of a station whose anchor (its top-left cell) is `anchor`.
fn stop_of_anchor(anchor: (i32, i32)) -> [i32; 2] {
    let (fw, fh) = BuildingKind::TrainStation.footprint();
    [anchor.0 + i32::from(fw) / 2, anchor.1 + i32::from(fh)]
}

pub(crate) fn station_at(sim: &Simulation, lineage: &str, stop: [i32; 2]) -> bool {
    sim.buildings.iter().any(|b| {
        b.kind == BuildingKind::TrainStation
            && b.is_operational()
            && b.owner_lineage.as_deref() == Some(lineage)
            && stop_of(b) == stop
    })
}

/// Indices of the grain stores (granaries and warehouses) a tribe holds within reach of `at`.
fn stores_near(sim: &Simulation, lineage: &str, at: [i32; 2]) -> Vec<usize> {
    sim.buildings
        .iter()
        .enumerate()
        .filter(|(_, b)| {
            matches!(b.kind, BuildingKind::Granary | BuildingKind::Warehouse)
                && b.is_operational()
                && b.owner_lineage.as_deref() == Some(lineage)
                && (b.x - at[0]).abs().max((b.y - at[1]).abs()) <= TOWN_REACH
        })
        .map(|(i, _)| i)
        .collect()
}

fn grain_near(sim: &Simulation, lineage: &str, at: [i32; 2]) -> u32 {
    stores_near(sim, lineage, at)
        .iter()
        .map(|&i| sim.buildings[i].stock)
        .sum()
}

/// Puts grain into the stores near `at`, the first with room first. Returns what did not fit.
fn put_near(sim: &mut Simulation, lineage: &str, at: [i32; 2], mut grain: u32) -> u32 {
    for i in stores_near(sim, lineage, at) {
        if grain == 0 {
            break;
        }
        let b = &mut sim.buildings[i];
        let cap = if b.kind == BuildingKind::Warehouse {
            WAREHOUSE_CAP
        } else {
            GRANARY_CAP
        };
        let put = cap.saturating_sub(b.stock).min(grain);
        b.stock += put;
        grain -= put;
    }
    grain
}

/// Takes up to `want` grain out of the stores near `at`. Returns what it took.
fn take_near(sim: &mut Simulation, lineage: &str, at: [i32; 2], want: u32) -> u32 {
    let mut got = 0;
    for i in stores_near(sim, lineage, at) {
        if got == want {
            break;
        }
        let b = &mut sim.buildings[i];
        let take = b.stock.min(want - got);
        b.stock -= take;
        got += take;
    }
    got
}

/// Calls up to `CALL_MAX` townsfolk of `town` who live and stand near `at` to the platform, to wait for the
/// next train. The train dwells long enough for them to walk there. Someone who has just stepped off here
/// lives at the other end, so is not called back.
fn call_townsfolk(sim: &mut Simulation, town: &str, at: [i32; 2]) {
    let now = sim.tick_count;
    let mut called = 0;
    for o in sim.organisms.iter_mut() {
        if called >= CALL_MAX {
            break;
        }
        let here_now = near((o.x, o.y), at, CALL_REACH);
        let lives_here = near((o.home_x, o.home_y), at, CALL_REACH);
        if o.alive && o.lineage_id == town && o.journey.is_none() && here_now && lives_here {
            o.begin_journey((at[0], at[1]), WAIT_FOR_TRAIN, now);
            called += 1;
        }
    }
}

/// The track a train runs along from one end of `line` to the other, last cell first, so the train pops the
/// next cell off the end. `at_a` says the train starts at `a`.
fn route_from(line: &RailLine, at_a: bool) -> Vec<(i32, i32)> {
    let cells: Vec<[i32; 2]> = if at_a {
        line.path.iter().rev().copied().collect()
    } else {
        std::iter::once(line.a)
            .chain(line.path[..line.path.len().saturating_sub(1)].iter().copied())
            .collect()
    };
    cells.into_iter().map(|[x, y]| (x, y)).collect()
}

impl Simulation {
    /// Lays track on busy trade routes when the era allows it, and runs the trains every `TRAIN_STEP_TICKS`.
    pub(crate) fn tick_rails(&mut self) {
        let now = self.tick_count;
        if now > 0 && now.is_multiple_of(RAIL_STEP) {
            self.plan_rail_lines();
        }
        if now > 0 && now.is_multiple_of(crate::sim::cosmos::DAY_LENGTH) {
            self.tend_rail();
        }
        if now.is_multiple_of(TRAIN_STEP_TICKS) && !self.vehicles.is_empty() {
            self.run_trains();
        }
    }

    fn plan_rail_lines(&mut self) {
        if self.rail_lines.len() >= MAX_LINES {
            return;
        }
        type Candidate = (
            std::cmp::Reverse<u32>,
            u32,
            String,
            (String, [i32; 2]),
            (String, [i32; 2]),
            Vec<[i32; 2]>,
        );
        let town = |id: u32| self.towns.iter().find(|t| t.id == id);
        let mut candidates: Vec<Candidate> = Vec::new();
        for edge in &self.road_net.edges {
            use crate::sim::civ::land::road_net::{Dest, NetKind, RAIL_TRAFFIC};
            if edge.kind != NetKind::Road
                || !matches!(edge.dest, Dest::Town | Dest::Partner)
                || !edge.complete()
                || edge.grade < 1
                || edge.traffic < RAIL_TRAFFIC
            {
                continue;
            }
            let (Some(ta), Some(tb)) = (town(edge.from_town), edge.to_town.and_then(town)) else {
                continue;
            };
            let a = (ta.lineage.to_string(), ta.center);
            let b = (tb.lineage.to_string(), tb.center);
            let (owner, a, b) = if self.era(&a.0) >= RAIL_ERA {
                (a.0.clone(), a, b)
            } else if self.era(&b.0) >= RAIL_ERA {
                (b.0.clone(), b, a)
            } else {
                continue;
            };
            candidates.push((
                std::cmp::Reverse(edge.traffic),
                edge.id,
                owner.to_string(),
                a,
                b,
                edge.path.clone(),
            ));
        }
        candidates.sort();
        let mut plans = 0;
        for (_, road, owner, a, b, corridor) in candidates {
            if self.rail_lines.len() >= MAX_LINES || plans >= PLANS_PER_PASS {
                break;
            }
            let served = self.rail_lines.iter().any(|l| {
                l.road == Some(road)
                    || (l.lineage == owner
                        && chebyshev(l.a, a.1) <= STATION_RING + 3
                        && chebyshev(l.b, b.1) <= STATION_RING + 3)
            });
            if served || (a.0 != b.0 && self.rail_connects(&owner, &b.0)) {
                continue;
            }
            plans += 1;
            self.plan_rail_between(&owner, (&a.0, a.1), (&b.0, b.1), Some((road, &corridor)));
        }
    }

    /// Lays one line from the town of `a` (lineage, centre) to the town of `b`, run by `owner`, if the way is
    /// busy. Returns whether it did.
    fn plan_rail_between(
        &mut self,
        owner: &str,
        a: (&str, [i32; 2]),
        b: (&str, [i32; 2]),
        road: Option<(u32, &[[i32; 2]])>,
    ) -> bool {
        let built = self.rail_lines.iter().filter(|l| l.lineage == owner).count();
        if built >= MAX_LINES_PER_TRIBE || self.rail_lines.len() >= MAX_LINES {
            return false;
        }
        let d = chebyshev(a.1, b.1);
        if !(MIN_RAIL..=MAX_RAIL).contains(&d) {
            return false;
        }
        let occupied = OccupiedMap::of(self);
        let mut extra: Vec<(i32, i32)> = Vec::new();
        let Some((sa, new_a)) = self.station_for(owner, a.1, &occupied, &mut extra) else {
            return false;
        };
        let Some((sb, new_b)) = self.station_for(owner, b.1, &occupied, &mut extra) else {
            return false;
        };
        let (sa_stop, sb_stop) = (stop_of_anchor(sa), stop_of_anchor(sb));
        if sa_stop == sb_stop {
            return false;
        }
        let blocked = |x: i32, y: i32| occupied.contains(x, y) || extra.contains(&(x, y));
        let corridor: FxHashSet<[i32; 2]> = road
            .map(|(_, cells)| {
                cells
                    .iter()
                    .flat_map(|&[x, y]| {
                        (-CORRIDOR..=CORRIDOR)
                            .flat_map(move |dy| (-CORRIDOR..=CORRIDOR).map(move |dx| [x + dx, y + dy]))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let busy_way = |x: i32, y: i32| {
            if road.is_some() {
                corridor.contains(&[x, y])
            } else {
                self.is_busy_way(x, y)
            }
        };
        let Some(path) = plan_road_avoiding(&self.grid, sa_stop, sb_stop, &blocked, &busy_way, None) else {
            return false;
        };
        if path.len() > MAX_PATH {
            return false;
        }
        let busy = path.iter().filter(|p| busy_way(p[0], p[1])).count();
        if (busy as f32) < BUSY_SHARE * path.len() as f32 {
            return false;
        }
        let now = self.tick_count;
        if new_a {
            self.raise_station(owner, sa);
        }
        if new_b {
            self.raise_station(owner, sb);
        }
        for &[x, y] in std::iter::once(&sa_stop).chain(path.iter()) {
            if self.grid.get(x, y).road_ground() {
                self.grid.road[WorldGrid::idx(x, y)] = ROAD_RAIL;
            }
        }
        let stops = if road.is_some() {
            self.raise_stops(owner, [a.0, b.0], [a.1, b.1], &path)
        } else {
            Vec::new()
        };
        let id = self.rail_lines.iter().map(|l| l.id).max().unwrap_or(0) + 1;
        self.rail_lines.push(RailLine {
            id,
            lineage: owner.to_string(),
            towns: [a.0.to_string(), b.0.to_string()],
            a: sa_stop,
            b: sb_stop,
            path,
            road: road.map(|(id, _)| id),
            stops,
        });
        let train = self.next_vehicle_id;
        self.next_vehicle_id += 1;
        self.vehicles.push(Vehicle {
            id: train,
            kind: TransportKind::Train,
            owner_lineage: owner.to_string(),
            x: sa_stop[0],
            y: sa_stop[1],
            occupants: Vec::new(),
            cargo: 0,
            route: Vec::new(),
            ready_tick: now + DWELL_TICKS,
            harbour: None,
            bound_for: None,
            ferry: None,
            rail_line: Some(id),
        });
        // The first train waits at its own platform while the townsfolk there walk to it.
        call_townsfolk(self, a.0, sa_stop);
        let name = self
            .lineage_names
            .get(owner)
            .cloned()
            .unwrap_or_else(|| owner.to_string());
        crate::sim::world_events::push_event(
            &mut self.events,
            now,
            "build",
            &name,
            "laid a railway along its busiest road, and a train runs along it",
        );
        true
    }

    fn raise_stops(
        &mut self,
        owner: &str,
        lineages: [&str; 2],
        ends: [[i32; 2]; 2],
        path: &[[i32; 2]],
    ) -> Vec<[i32; 2]> {
        let on_line: FxHashSet<[i32; 2]> = path.iter().copied().collect();
        let towns: Vec<[i32; 2]> = self
            .towns
            .iter()
            .filter(|t| lineages.contains(&t.lineage.as_str()))
            .map(|t| t.center)
            .filter(|&c| ends.iter().all(|&e| chebyshev(e, c) > STATION_RING * 2))
            .collect();
        let (fw, fh) = BuildingKind::TrainStation.footprint();
        let mut stops = Vec::new();
        for centre in towns {
            let mut near: Vec<(i32, [i32; 2])> = path
                .iter()
                .map(|&p| (chebyshev(p, centre), p))
                .filter(|&(d, _)| d <= STOP_REACH)
                .collect();
            near.sort();
            let occupied = OccupiedMap::of(self);
            let site = near.into_iter().find_map(|(_, [px, py])| {
                let anchor = (px - i32::from(fw) / 2, py - i32::from(fh));
                let clear = (0..i32::from(fh)).all(|oy| {
                    (0..i32::from(fw)).all(|ox| !on_line.contains(&[anchor.0 + ox, anchor.1 + oy]))
                });
                (clear && fits(self, anchor.0, anchor.1, BuildingKind::TrainStation, &occupied))
                    .then_some((anchor, [px, py]))
            });
            if let Some((anchor, stop)) = site {
                self.raise_station(owner, anchor);
                stops.push(stop);
            }
        }
        stops
    }

    /// The track cell a train heads for next: the end of its route while it runs, otherwise the first cell
    /// of its line from where it stands. `None` for a vehicle that is not on a line.
    pub(crate) fn train_next_cell(&self, v: &Vehicle) -> Option<(i32, i32)> {
        if let Some(&cell) = v.route.last() {
            return Some(cell);
        }
        let line = self.rail_lines.iter().find(|l| Some(l.id) == v.rail_line)?;
        if [v.x, v.y] == line.a {
            line.path.first().map(|&[x, y]| (x, y))
        } else {
            let n = line.path.len();
            if n >= 2 {
                let [x, y] = line.path[n - 2];
                Some((x, y))
            } else {
                Some((line.a[0], line.a[1]))
            }
        }
    }

    /// A cell people use: a road or track they built, or a path they have trodden.
    fn is_busy_way(&self, x: i32, y: i32) -> bool {
        self.grid.road_at(x, y) != ROAD_NONE || self.grid.trail_at(x, y, TrailKind::Path) >= BUSY_TRAIL
    }

    /// Whether `owner` already runs a line to the town of `partner`.
    fn rail_connects(&self, owner: &str, partner: &str) -> bool {
        self.rail_lines
            .iter()
            .any(|l| l.lineage == owner && l.towns.iter().any(|t| t == partner))
    }

    /// The anchor of the station a town's trains use, and whether it is new: an operational station of the
    /// owner within reach of the centre, or else the first open site near the centre. `extra` collects the
    /// cells a new station covers so the next search keeps off them.
    fn stop_is_clear(&self, stop: [i32; 2], occupied: &OccupiedMap, extra: &[(i32, i32)]) -> bool {
        let (x, y) = (stop[0], stop[1]);
        WorldGrid::in_bounds(x, y)
            && self.grid.get(x, y).road_ground()
            && !occupied.contains(x, y)
            && !extra.contains(&(x, y))
    }

    fn station_for(
        &self,
        owner: &str,
        centre: [i32; 2],
        occupied: &OccupiedMap,
        extra: &mut Vec<(i32, i32)>,
    ) -> Option<((i32, i32), bool)> {
        if let Some(b) = self.buildings.iter().find(|b| {
            b.kind == BuildingKind::TrainStation
                && b.is_operational()
                && b.owner_lineage.as_deref() == Some(owner)
                && chebyshev(stop_of(b), centre) <= STATION_RING
                && self.stop_is_clear(stop_of(b), occupied, extra)
        }) {
            return Some(((b.x, b.y), false));
        }
        let (fw, fh) = BuildingKind::TrainStation.footprint();
        for r in 0..=STATION_RING {
            for dy in -r..=r {
                for dx in -r..=r {
                    if dx.abs().max(dy.abs()) != r {
                        continue;
                    }
                    let (x, y) = (centre[0] + dx, centre[1] + dy);
                    let overlaps = (0..i32::from(fh))
                        .any(|oy| (0..i32::from(fw)).any(|ox| extra.contains(&(x + ox, y + oy))));
                    if overlaps
                        || !fits(self, x, y, BuildingKind::TrainStation, occupied)
                        || !self.stop_is_clear(stop_of_anchor((x, y)), occupied, extra)
                    {
                        continue;
                    }
                    for oy in 0..i32::from(fh) {
                        for ox in 0..i32::from(fw) {
                            extra.push((x + ox, y + oy));
                        }
                    }
                    return Some(((x, y), true));
                }
            }
        }
        None
    }

    /// Raises a station at `anchor` for the tribe, complete at once like the harbour works.
    fn raise_station(&mut self, owner: &str, anchor: (i32, i32)) {
        let id = self.next_building_id;
        self.next_building_id = id.saturating_add(1);
        let mut station = Building::new(
            id,
            BuildingKind::TrainStation,
            anchor.0,
            anchor.1,
            Some(owner.to_string()),
            self.tick_count,
        );
        station.condition = 1.0;
        self.buildings.push(station);
    }

    /// Moves every train one step, boards and lands passengers, and carries the riders along.
    fn run_trains(&mut self) {
        let now = self.tick_count;
        // Where each rider is, and whether it steps off here.
        let mut riders: BTreeMap<String, ((i32, i32), bool)> = BTreeMap::new();
        for vi in 0..self.vehicles.len() {
            let v = &self.vehicles[vi];
            if v.kind != TransportKind::Train || now < v.ready_tick {
                continue;
            }
            let Some(line_id) = v.rail_line else { continue };
            let Some(line) = self.rail_lines.iter().find(|l| l.id == line_id).cloned() else {
                continue;
            };
            if v.route.is_empty() {
                // At a station: leave for the other end.
                let at_a = [v.x, v.y] == line.a;
                self.depart(vi, &line, at_a);
                continue;
            }
            let (nx, ny) = self.vehicles[vi]
                .route
                .pop()
                .unwrap_or((self.vehicles[vi].x, self.vehicles[vi].y));
            self.vehicles[vi].x = nx;
            self.vehicles[vi].y = ny;
            if self.vehicles[vi].route.is_empty() {
                // Arrived: everyone aboard steps off here, and the grain is put away in this town's stores.
                let town = if (nx, ny) == (line.b[0], line.b[1]) {
                    &line.towns[1]
                } else {
                    &line.towns[0]
                };
                for id in std::mem::take(&mut self.vehicles[vi].occupants) {
                    riders.insert(id, ((nx, ny), true));
                }
                let cargo = std::mem::take(&mut self.vehicles[vi].cargo);
                let left = put_near(self, town, [nx, ny], cargo);
                let _ = crate::sim::civ::land::village_stores::deposit(self, town, left);
                call_townsfolk(self, town, [nx, ny]);
                self.vehicles[vi].ready_tick = now + DWELL_TICKS;
            } else {
                for id in &self.vehicles[vi].occupants {
                    riders.insert(id.clone(), ((nx, ny), false));
                }
                if line.stops.contains(&[nx, ny]) {
                    self.vehicles[vi].ready_tick = now + STOP_DWELL_TICKS;
                }
            }
        }
        if riders.is_empty() {
            return;
        }
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if let Some(&((x, y), alight)) = riders.get(o.id.as_str()) {
                o.x = x as f32;
                o.y = y as f32;
                if alight {
                    o.journey = None;
                    o.wander_target = None;
                }
            }
        }
    }

    /// At one end of `line`: calls the townsfolk of that end's town to the platform, takes grain across if
    /// the far town's stores are emptier, boards the people waiting here, and sets off.
    fn depart(&mut self, vi: usize, line: &RailLine, at_a: bool) {
        let now = self.tick_count;
        let (here, there) = if at_a { (line.a, line.b) } else { (line.b, line.a) };
        let (town, far_town) = if at_a {
            (line.towns[0].clone(), line.towns[1].clone())
        } else {
            (line.towns[1].clone(), line.towns[0].clone())
        };
        let owner = self.vehicles[vi].owner_lineage.clone();
        if !station_at(self, &owner, here) || !station_at(self, &owner, there) {
            self.vehicles[vi].ready_tick = now + STALLED_TICKS;
            return;
        }
        // Passengers waiting on the platform board, first come first served.
        let mut boarding: Vec<usize> = Vec::new();
        for (oi, o) in self.organisms.iter().enumerate() {
            if boarding.len() >= TRAIN_CAP_PEOPLE {
                break;
            }
            // Only people waiting at this platform: someone called to the other end does not ride from here.
            let waiting = o
                .journey
                .as_ref()
                .is_some_and(|j| j.description == WAIT_FOR_TRAIN && j.target == (here[0], here[1]));
            if o.alive && waiting && near((o.x, o.y), here, BOARD_REACH) {
                boarding.push(oi);
            }
        }
        for oi in boarding {
            let o: &mut Organism = &mut self.organisms[oi];
            o.journey = None;
            o.wander_target = None;
            o.x = here[0] as f32;
            o.y = here[1] as f32;
            let id = o.id;
            self.vehicles[vi].occupants.push(id.to_string());
        }
        // Grain goes across when the far town's stores are emptier by more than the margin.
        let origin = grain_near(self, &town, here);
        let far = grain_near(self, &far_town, there);
        let cargo = if origin > far + GOODS_MARGIN {
            take_near(self, &town, here, ((origin - far) / 2).min(TRAIN_CAP_GOODS))
        } else {
            0
        };
        self.vehicles[vi].cargo = cargo;
        self.vehicles[vi].route = route_from(line, at_a);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::civ_tick::town::Town;
    use crate::sim::civ::land::road_net::{Dest, NetEdge, RAIL_TRAFFIC};
    use crate::world::grid::ROAD_TRACK;
    use crate::world::tiles::Tile;

    const OWNER: &str = "owner-tribe";
    const PARTNER: &str = "partner-tribe";

    /// Grass from x 88 to 170, a dirt road along y = 100 between the two towns, twenty people of the owner
    /// tribe and twenty of the partner tribe. Towns are centred at (93, 96) and (150, 96). The owner has
    /// reached the industrial age, and a granary stands in each town.
    fn two_towns() -> Simulation {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        sim.vehicles.clear();
        for y in 90..=110 {
            for x in 88..=170 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for x in 96..=146 {
            sim.grid.road[WorldGrid::idx(x, 100)] = ROAD_TRACK;
        }
        sim.organisms.truncate(40);
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = true;
            o.lineage_id = (if i < 20 { OWNER } else { PARTNER }.to_string()).into();
            o.x = 60.0;
            o.y = 60.0;
        }
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            let home = if i < 20 { 93.0 } else { 150.0 };
            o.home_x = home;
            o.home_y = 96.0;
        }
        sim.lineage_eras.insert(OWNER.to_string().into(), Era::Industrial);
        sim.lineage_eras
            .insert(PARTNER.to_string().into(), Era::Industrial);
        for (id, x, owner) in [(9003u32, 92, OWNER), (9004, 149, PARTNER)] {
            let mut b = Building::new(id, BuildingKind::Granary, x, 104, Some(owner.to_string()), 0);
            b.condition = 1.0;
            sim.buildings.push(b);
        }
        sim
    }

    fn town(id: u32, lineage: &str, center: [i32; 2]) -> Town {
        Town {
            id,
            lineage: lineage.to_string().into(),
            center,
            streets: Vec::new(),
            founded_tick: 0,
            planned: false,
            growth: 0,
            ..Default::default()
        }
    }

    fn busy_road(sim: &mut Simulation, traffic: u32) -> u32 {
        sim.towns.push(town(1, OWNER, [93, 96]));
        sim.towns.push(town(2, PARTNER, [150, 96]));
        let path: Vec<[i32; 2]> = std::iter::once([93, 96])
            .chain((97..=100).map(|y| [93, y]))
            .chain((94..=150).map(|x| [x, 100]))
            .chain((96..=99).rev().map(|y| [150, y]))
            .collect();
        sim.road_net.edges.push(NetEdge {
            id: 7,
            owner: OWNER.to_string(),
            dest: Dest::Partner,
            from_town: 1,
            to_town: Some(2),
            from: [93, 96],
            to: [150, 96],
            built: path.len() as u16,
            path,
            traffic,
            grade: 1,
            ..Default::default()
        });
        7
    }

    fn plan(sim: &mut Simulation) -> bool {
        sim.tick_count = RAIL_STEP;
        sim.plan_rail_between(OWNER, (OWNER, [93, 96]), (PARTNER, [150, 96]), None)
    }

    fn run_to(sim: &mut Simulation, until: u64) {
        for t in 0..=until {
            sim.tick_count = t;
            if t.is_multiple_of(TRAIN_STEP_TICKS) {
                sim.run_trains();
            }
        }
    }

    fn granary_stock(sim: &Simulation, x: i32) -> u32 {
        sim.buildings
            .iter()
            .find(|b| b.kind == BuildingKind::Granary && b.x == x)
            .map(|b| b.stock)
            .unwrap_or(0)
    }

    #[test]
    fn no_track_before_the_industrial_age() {
        let mut sim = two_towns();
        sim.lineage_eras.insert(OWNER.to_string().into(), Era::Classical);
        sim.lineage_eras
            .insert(PARTNER.to_string().into(), Era::Classical);
        busy_road(&mut sim, RAIL_TRAFFIC * 2);
        sim.tick_count = RAIL_STEP;
        sim.plan_rail_lines();
        assert!(sim.rail_lines.is_empty(), "no railway before the industrial age");
        assert!(!sim.vehicles.iter().any(|v| v.kind == TransportKind::Train));
    }

    #[test]
    fn a_quiet_road_gets_no_track() {
        let mut sim = two_towns();
        busy_road(&mut sim, RAIL_TRAFFIC - 1);
        sim.tick_count = RAIL_STEP;
        sim.plan_rail_lines();
        assert!(
            sim.rail_lines.is_empty(),
            "a road nobody uses is not worth a railway"
        );
    }

    #[test]
    fn a_busy_road_gets_stations_track_a_stop_and_a_train() {
        let mut sim = two_towns();
        let road = busy_road(&mut sim, RAIL_TRAFFIC);
        sim.towns.push(town(3, OWNER, [121, 94]));
        sim.tick_count = RAIL_STEP;
        sim.plan_rail_lines();
        assert_eq!(sim.rail_lines.len(), 1, "one line along the road");
        let line = sim.rail_lines[0].clone();
        assert_eq!(line.road, Some(road));
        assert_eq!(line.stops.len(), 1, "a stop at the town on the way");
        assert!(line.path.contains(&line.stops[0]));
        let counts = crate::sim::civ::land::road_net::net_counts(&sim);
        assert_eq!(
            counts.rail_on_roads, counts.rail_cells,
            "the track keeps beside the road"
        );
        assert_eq!(line.lineage, OWNER);
        assert_eq!(line.towns, [OWNER.to_string(), PARTNER.to_string()]);
        assert_eq!(
            line.a,
            [94, 99],
            "the stop is below a station of three by three at the town centre"
        );
        assert_eq!(line.b, [151, 99]);
        let stations = sim
            .buildings
            .iter()
            .filter(|b| {
                b.kind == BuildingKind::TrainStation
                    && b.is_operational()
                    && b.owner_lineage.as_deref() == Some(OWNER)
            })
            .count();
        assert_eq!(stations, 3, "a station at each end and one at the stop");
        assert_eq!(
            crate::sim::tech::networks::network_strays(&sim).stations_without_line,
            0
        );
        assert!(line
            .path
            .iter()
            .all(|&[x, y]| sim.grid.road_at(x, y) == ROAD_RAIL));
        assert_eq!(sim.grid.road_at(line.b[0], line.b[1]), ROAD_RAIL);
        let trains: Vec<&Vehicle> = sim
            .vehicles
            .iter()
            .filter(|v| v.kind == TransportKind::Train)
            .collect();
        assert_eq!(trains.len(), 1);
        assert_eq!((trains[0].x, trains[0].y), (line.a[0], line.a[1]));
        assert_eq!(trains[0].rail_line, Some(line.id));
        sim.tick_count = RAIL_STEP * 2;
        sim.plan_rail_lines();
        assert_eq!(sim.rail_lines.len(), 1, "one line along a road only");
    }

    #[test]
    fn a_route_with_no_way_between_is_not_laid() {
        let mut sim = two_towns();
        for x in 96..=146 {
            sim.grid.road[WorldGrid::idx(x, 100)] = ROAD_NONE;
        }
        assert!(!plan(&mut sim), "the people do not walk there, so no track");
        assert!(sim.rail_lines.is_empty());
    }

    #[test]
    fn a_path_people_have_trodden_is_a_busy_way() {
        let mut sim = two_towns();
        for x in 94..=152 {
            for y in 99..=101 {
                sim.grid.road[WorldGrid::idx(x, 100)] = ROAD_NONE;
                sim.grid.path_trail[WorldGrid::idx(x, y)] = 0.5;
            }
        }
        assert!(
            plan(&mut sim),
            "a trodden path carries the track even without a road"
        );
    }

    #[test]
    fn the_train_carries_grain_to_the_emptier_town() {
        let mut sim = two_towns();
        assert!(plan(&mut sim));
        for b in sim
            .buildings
            .iter_mut()
            .filter(|b| b.kind == BuildingKind::Granary && b.x == 92)
        {
            b.stock = 30;
        }
        run_to(&mut sim, RAIL_STEP + 600);
        assert_eq!(
            granary_stock(&sim, 92) + granary_stock(&sim, 149),
            30,
            "grain is moved, not made or lost"
        );
        assert!(
            granary_stock(&sim, 149) >= 12,
            "the far town gets the grain: {}",
            granary_stock(&sim, 149)
        );
        let train = sim
            .vehicles
            .iter()
            .find(|v| v.kind == TransportKind::Train)
            .unwrap();
        assert!(train.occupants.is_empty());
        assert_eq!(train.cargo, 0, "the train has unloaded");
    }

    #[test]
    fn people_waiting_at_the_platform_ride_to_the_other_town() {
        let mut sim = two_towns();
        assert!(plan(&mut sim));
        let a = sim.rail_lines[0].a;
        let b = sim.rail_lines[0].b;
        let rider = 0usize;
        sim.organisms[rider].x = a[0] as f32;
        sim.organisms[rider].y = a[1] as f32;
        sim.organisms[rider].begin_journey((a[0], a[1]), WAIT_FOR_TRAIN, RAIL_STEP);
        let id = sim.organisms[rider].id.to_string();
        run_to(&mut sim, RAIL_STEP + DWELL_TICKS + 2);
        let train = sim
            .vehicles
            .iter()
            .find(|v| v.kind == TransportKind::Train)
            .unwrap();
        assert!(train.occupants.contains(&id), "the rider boards at the platform");
        assert!(sim.organisms[rider].journey.is_none());
        run_to(&mut sim, RAIL_STEP + 600);
        let o = &sim.organisms[rider];
        assert!(
            (o.x as i32 - b[0]).abs().max((o.y as i32 - b[1]).abs()) <= 1,
            "the rider steps off at the far station, at ({}, {})",
            o.x,
            o.y
        );
        assert!(o.journey.is_none());
    }

    fn pass_days(sim: &mut Simulation, days: u64) {
        for _ in 0..days {
            sim.tick_count =
                (sim.tick_count / crate::sim::cosmos::DAY_LENGTH + 1) * crate::sim::cosmos::DAY_LENGTH;
            sim.tend_rail();
            crate::sim::civ::vacancy::tick_vacancy(sim);
        }
    }

    fn rail_cells(sim: &Simulation) -> usize {
        sim.grid.road.iter().filter(|&&r| r == ROAD_RAIL).count()
    }

    #[test]
    fn a_line_in_use_keeps_its_track_and_mends_a_cut() {
        let mut sim = two_towns();
        assert!(plan(&mut sim));
        let line = sim.rail_lines[0].clone();
        let [gx, gy] = line.path[line.path.len() / 2];
        sim.grid.road[WorldGrid::idx(gx, gy)] = ROAD_TRACK;
        pass_days(&mut sim, 6);
        assert_eq!(sim.rail_lines.len(), 1, "the line still joins two towns");
        assert!(line
            .path
            .iter()
            .all(|&[x, y]| sim.grid.road_at(x, y) == ROAD_RAIL));
        let strays = crate::sim::tech::networks::network_strays(&sim);
        assert_eq!(strays.stray_rail, 0);
        assert_eq!(strays.stations_without_line, 0);
        assert!(sim
            .buildings
            .iter()
            .filter(|b| b.kind == BuildingKind::TrainStation)
            .all(|b| b.is_operational() && b.damage_fraction() == 0.0));
    }

    #[test]
    fn a_line_that_loses_a_station_closes_and_its_track_fades_away() {
        let mut sim = two_towns();
        assert!(plan(&mut sim));
        let line = sim.rail_lines[0].clone();
        let trodden = line.path[3];
        sim.grid.path_trail[WorldGrid::idx(trodden[0], trodden[1])] = 0.5;
        let now = sim.tick_count;
        let station = sim
            .buildings
            .iter_mut()
            .find(|b| b.kind == BuildingKind::TrainStation && stop_of(b) == line.b)
            .expect("the far station");
        station.damage = 1.0;
        station.ruined_at_tick = Some(now);
        pass_days(&mut sim, 1);
        assert!(sim.rail_lines.is_empty(), "a line with a ruined station closes");
        assert!(!sim.vehicles.iter().any(|v| v.kind == TransportKind::Train));
        assert!(rail_cells(&sim) > 0, "its track lies a day before it goes");
        pass_days(&mut sim, 1);
        assert_eq!(rail_cells(&sim), 0, "no rail outside a live line after two days");
        pass_days(&mut sim, 4);
        assert_eq!(
            sim.grid.road_at(trodden[0], trodden[1]),
            ROAD_TRACK,
            "a path people walk stays"
        );
        let [x, y] = line.path[line.path.len() / 2];
        assert_eq!(sim.grid.road_at(x, y), ROAD_NONE, "the rest of the bed is gone");
        assert!(sim.rail_remnants.is_empty());
    }

    #[test]
    fn a_station_with_no_line_falls_to_ruin_and_crumbles_away() {
        let mut sim = two_towns();
        let id = sim.next_building_id;
        sim.next_building_id += 1;
        let mut station = Building::new(
            id,
            BuildingKind::TrainStation,
            120,
            92,
            Some(OWNER.to_string()),
            0,
        );
        station.condition = 1.0;
        sim.buildings.push(station);
        pass_days(&mut sim, 4);
        let station = sim.buildings.iter().find(|b| b.id == id).expect("still standing");
        assert!(station.is_ruined(), "a station no train calls at falls in");
        pass_days(&mut sim, 21);
        assert!(
            !sim.buildings.iter().any(|b| b.id == id),
            "and its ruin crumbles away"
        );
    }

    #[test]
    fn someone_waiting_for_the_other_end_does_not_ride_from_here() {
        let mut sim = two_towns();
        assert!(plan(&mut sim));
        let a = sim.rail_lines[0].a;
        let b = sim.rail_lines[0].b;
        sim.organisms[0].x = a[0] as f32;
        sim.organisms[0].y = a[1] as f32;
        sim.organisms[0].begin_journey((b[0], b[1]), WAIT_FOR_TRAIN, RAIL_STEP);
        run_to(&mut sim, RAIL_STEP + DWELL_TICKS + 2);
        let train = sim
            .vehicles
            .iter()
            .find(|v| v.kind == TransportKind::Train)
            .unwrap();
        assert!(
            train.occupants.is_empty(),
            "the train leaves a without someone waiting for b"
        );
    }
}
