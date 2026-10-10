//! Fishing boats. A coastal tribe keeps a small fleet at its harbour: an unmanned boat sails short
//! loops over the water near the harbour by day, and makes for its mooring at night and in storms.
//! A boat set down on dry land by a crossing (see `boats.rs`) puts back out to its harbour.
//! Fleet boats carry no passengers, so the crossings in `boats.rs` never take one.
use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;
use crate::sim::transportation::{TransportKind, Vehicle};
use crate::world::{grid::WorldGrid, tiles::Tile};
use rand::RngExt;

const CARDINAL: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];

/// How often the tribes are checked for a boat to launch, in ticks.
const LAUNCH_CHECK_TICKS: u64 = 50;
/// Boats a tribe keeps at most.
const MAX_PER_TRIBE: usize = 3;
/// Boats in the whole world at most.
const MAX_FLEET: usize = 40;
/// Tribe members needed before a harbour is worth a boat.
const MIN_TRIBE_FOR_BOAT: usize = 6;
/// How far from a home a harbour may lie, in tiles.
const HARBOUR_RANGE: i32 = 5;
/// How far from its harbour a boat fishes, in tiles (a square search box).
const REACH: i32 = 8;
/// How far from its harbour a boat may be and still find its way home, in tiles.
const HOME_RANGE: i32 = 40;
/// Ticks between two steps of a boat under way (eight tiles take 24 ticks).
const STEP_TICKS: u64 = 3;
/// Ticks between two attempts to plan a voyage for one boat (keeps stranded boats cheap).
const PLAN_TICKS: u64 = 6;
/// Ticks between two looks for a trade voyage, in fair weather.
const TRADE_CHECK_TICKS: u64 = 200;
/// Food a trade boat carries on one voyage, at most.
const TRADE_LOAD: u32 = 3;
/// A ship (a sailing ship from the classical age, a steamship from the industrial age) carries this much food.
const SHIP_LOAD: u32 = 8;
/// How far a ship's water reaches for a trade voyage, in tiles of sea (boats reach `TRADE_RANGE`).
const SHIP_RANGE: i32 = 90;
/// How often a moored boat is refitted as a ship, once its tribe has reached the classical age.
const REFIT_TICKS: u64 = 500;
/// The earliest age a tribe refits its boats as ships.
const SHIP_ERA: crate::sim::era::Era = crate::sim::era::Era::Classical;
/// How far by water a trade voyage may reach from its harbour, in tiles.
const TRADE_RANGE: i32 = 40;
/// How close to a harbour a person must stand to load or receive a trade boat's food, in tiles.
const QUAY_RANGE: i32 = 6;
/// Food a fishing boat lands on the quay when it comes home from a loop.
const CATCH: u32 = 2;

/// A breadth-first search over water inside a square box: how many steps each tile lies from the
/// start, and which tile it was reached from.
struct WaterChart {
    x0: i32,
    y0: i32,
    side: i32,
    steps: Vec<u32>,
    from: Vec<u32>,
}

impl WaterChart {
    fn new(grid: &WorldGrid, start: (i32, i32), centre: (i32, i32), radius: i32) -> Option<Self> {
        let side = 2 * radius + 1;
        let mut chart = WaterChart {
            x0: centre.0 - radius,
            y0: centre.1 - radius,
            side,
            steps: vec![u32::MAX; (side * side) as usize],
            from: vec![0; (side * side) as usize],
        };
        let s = chart.index(start)?;
        if grid.get(start.0, start.1) != Tile::Water {
            return None;
        }
        chart.steps[s] = 0;
        let mut queue = std::collections::VecDeque::from([start]);
        while let Some(p) = queue.pop_front() {
            let here = chart.index(p)?;
            for (dx, dy) in CARDINAL {
                let q = (p.0 + dx, p.1 + dy);
                let Some(qi) = chart.index(q) else { continue };
                if chart.steps[qi] == u32::MAX && grid.get(q.0, q.1) == Tile::Water {
                    chart.steps[qi] = chart.steps[here] + 1;
                    chart.from[qi] = here as u32;
                    queue.push_back(q);
                }
            }
        }
        Some(chart)
    }

    fn index(&self, p: (i32, i32)) -> Option<usize> {
        let (x, y) = (p.0 - self.x0, p.1 - self.y0);
        if x < 0 || y < 0 || x >= self.side || y >= self.side {
            return None;
        }
        Some((y * self.side + x) as usize)
    }

    fn tile(&self, i: usize) -> (i32, i32) {
        (self.x0 + (i as i32) % self.side, self.y0 + (i as i32) / self.side)
    }

    /// The route to a reached tile, in boat order: the target first, the first step last.
    fn route_to(&self, target: (i32, i32)) -> Option<Vec<(i32, i32)>> {
        let mut cur = self.index(target)?;
        if self.steps[cur] == u32::MAX {
            return None;
        }
        let mut route = vec![target];
        while self.steps[cur] > 1 {
            cur = self.from[cur] as usize;
            route.push(self.tile(cur));
        }
        Some(route)
    }
}

/// The water tile nearest to (x, y) that lies beside dry land, within `HARBOUR_RANGE`.
fn harbour_near(grid: &WorldGrid, x: i32, y: i32) -> Option<(i32, i32)> {
    let mut best: Option<((i32, i32), i32)> = None;
    for dy in -HARBOUR_RANGE..=HARBOUR_RANGE {
        for dx in -HARBOUR_RANGE..=HARBOUR_RANGE {
            let (wx, wy) = (x + dx, y + dy);
            if !WorldGrid::in_bounds(wx, wy) || grid.get(wx, wy) != Tile::Water {
                continue;
            }
            let shore = CARDINAL.iter().any(|&(ex, ey)| {
                let (nx, ny) = (wx + ex, wy + ey);
                WorldGrid::in_bounds(nx, ny) && grid.get(nx, ny).walkable() && grid.get(nx, ny) != Tile::Water
            });
            let d = dx.abs() + dy.abs();
            if shore && best.is_none_or(|(_, bd)| d < bd) {
                best = Some(((wx, wy), d));
            }
        }
    }
    best.map(|(p, _)| p)
}

/// The way from a harbour to the dry land beside it (a cardinal step), for the pier drawn there.
pub(crate) fn harbour_shore(grid: &WorldGrid, harbour: (i32, i32)) -> Option<(i32, i32)> {
    CARDINAL.iter().copied().find(|&(dx, dy)| {
        let (x, y) = (harbour.0 + dx, harbour.1 + dy);
        WorldGrid::in_bounds(x, y) && grid.get(x, y).walkable() && grid.get(x, y) != Tile::Water
    })
}

/// Whether a person stands close enough to a harbour to load or receive from its boat.
fn on_quay(o: &Organism, quay: (i32, i32)) -> bool {
    (o.x as i32 - quay.0).abs().max((o.y as i32 - quay.1).abs()) <= QUAY_RANGE
}

/// A water tile beside `p`, for a boat that was set down on dry land.
fn water_beside(grid: &WorldGrid, p: (i32, i32)) -> Option<(i32, i32)> {
    CARDINAL
        .iter()
        .map(|&(dx, dy)| (p.0 + dx, p.1 + dy))
        .find(|&(x, y)| WorldGrid::in_bounds(x, y) && grid.get(x, y) == Tile::Water)
}

impl Simulation {
    /// Launches fleet boats for coastal tribes, sends trade boats out, and moves the unmanned ones.
    pub(crate) fn tick_fleet(&mut self) {
        if self.tick_count.is_multiple_of(LAUNCH_CHECK_TICKS) {
            self.launch_fleet_boats();
        }
        if self.tick_count.is_multiple_of(REFIT_TICKS) {
            self.refit_ships();
        }
        self.tick_trade();
        self.move_fleet_boats();
        self.tick_stranded_boats();
    }

    /// In fair weather a moored fishing boat takes food from the people on its quay and sails to the
    /// nearest harbour of another tribe that the water reaches (see `unload_at`).
    /// A moored fishing boat whose tribe has reached the classical age is refitted as a ship: a
    /// sailing ship from then on, a steamship once the tribe is industrial (the hull follows the era).
    fn refit_ships(&mut self) {
        for i in 0..self.vehicles.len() {
            let v = &self.vehicles[i];
            if v.kind != TransportKind::Boat
                || v.harbour.is_none()
                || !v.occupants.is_empty()
                || !v.route.is_empty()
                || self.era(&v.owner_lineage) < SHIP_ERA
            {
                continue;
            }
            self.vehicles[i].kind = TransportKind::Ship;
        }
    }

    fn tick_trade(&mut self) {
        if !self.tick_count.is_multiple_of(TRADE_CHECK_TICKS) || self.is_night() || self.weather.kind == 2 {
            return;
        }
        for i in 0..self.vehicles.len() {
            let v = &self.vehicles[i];
            let ship = v.kind == TransportKind::Ship;
            if !(ship || v.kind == TransportKind::Boat)
                || !v.occupants.is_empty()
                || v.bound_for.is_some()
                || v.cargo > 0
                || !v.route.is_empty()
            {
                continue;
            }
            let Some(home) = v.harbour else { continue };
            if (v.x, v.y) != home {
                continue;
            }
            let owner = v.owner_lineage.clone();
            let (range, load) = if ship {
                (SHIP_RANGE, SHIP_LOAD)
            } else {
                (TRADE_RANGE, TRADE_LOAD)
            };
            let Some(chart) = WaterChart::new(&self.grid, home, home, range) else {
                continue;
            };
            // The nearest harbour of another tribe that the water reaches.
            let mut dest: Option<((i32, i32), u32)> = None;
            for w in &self.vehicles {
                let Some(h) = w.harbour else { continue };
                if w.owner_lineage == owner || h == home {
                    continue;
                }
                let Some(k) = chart.index(h) else { continue };
                let steps = chart.steps[k];
                if steps != u32::MAX && dest.is_none_or(|(_, best)| steps < best) {
                    dest = Some((h, steps));
                }
            }
            let Some((dest, _)) = dest else { continue };
            // Food from the people on the quay, up to the hold's size.
            let mut loaded = 0u32;
            for o in self
                .organisms
                .iter_mut()
                .filter(|o| o.alive && o.lineage_id == owner && on_quay(o, home))
            {
                while o.inv_food > 0 && loaded < load {
                    o.inv_food -= 1;
                    loaded += 1;
                }
                if loaded >= load {
                    break;
                }
            }
            if loaded == 0 {
                continue;
            }
            let Some(route) = chart.route_to(dest) else {
                continue;
            };
            let v = &mut self.vehicles[i];
            v.cargo = loaded;
            v.bound_for = Some(dest);
            v.route = route;
        }
    }

    /// A fishing boat that comes home lands its catch on the quay: food for the nearest person there.
    fn land_catch(&mut self, quay: (i32, i32)) {
        let receiver = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && on_quay(o, quay))
            .min_by_key(|(_, o)| (o.x as i32 - quay.0).abs() + (o.y as i32 - quay.1).abs())
            .map(|(k, _)| k);
        if let Some(k) = receiver {
            let o = &mut self.organisms[k];
            o.inv_food = (u32::from(o.inv_food) + CATCH).min(u32::from(u8::MAX)) as u8;
            o.log_event("the boat came in with fish for the quay".into());
        }
    }

    /// A trade boat has reached the far harbour: its food goes to the nearest person on that quay,
    /// and the boat sails home.
    fn unload_at(&mut self, i: usize, quay: (i32, i32), harbour: (i32, i32)) {
        let cargo = self.vehicles[i].cargo;
        let receiver = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && on_quay(o, quay))
            .min_by_key(|(_, o)| (o.x as i32 - quay.0).abs() + (o.y as i32 - quay.1).abs())
            .map(|(k, _)| k);
        if let Some(k) = receiver {
            let o = &mut self.organisms[k];
            o.inv_food = (u32::from(o.inv_food) + cargo).min(u32::from(u8::MAX)) as u8;
            o.log_event("food came to the quay by boat from another tribe".into());
        }
        let v = &mut self.vehicles[i];
        v.cargo = 0;
        v.bound_for = None;
        self.route_home(i, quay, harbour);
    }

    /// A tribe with a fisher and a harbour near its homes gets one boat, then up to one more per
    /// twelve members (at most `MAX_PER_TRIBE`), moored at the harbour.
    fn launch_fleet_boats(&mut self) {
        let mut fleet_total = self.vehicles.iter().filter(|v| v.harbour.is_some()).count();
        let mut tribes: Vec<String> = Vec::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            if !tribes.contains(&o.lineage_id) {
                tribes.push(o.lineage_id.clone());
            }
        }
        for tribe in tribes {
            if fleet_total >= MAX_FLEET {
                break;
            }
            let members: Vec<usize> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(_, o)| o.alive && o.lineage_id == tribe)
                .map(|(i, _)| i)
                .collect();
            if members.len() < MIN_TRIBE_FOR_BOAT
                || !members
                    .iter()
                    .any(|&i| self.organisms[i].discoveries.contains("fishing"))
            {
                continue;
            }
            let owned = self
                .vehicles
                .iter()
                .filter(|v| v.harbour.is_some() && v.owner_lineage == tribe)
                .count();
            if owned >= MAX_PER_TRIBE.min(1 + members.len() / 12) {
                continue;
            }
            let harbour = members.iter().find_map(|&i| {
                let o = &self.organisms[i];
                harbour_near(&self.grid, o.home_x.round() as i32, o.home_y.round() as i32)
            });
            let Some((hx, hy)) = harbour else { continue };
            self.vehicles.push(Vehicle {
                id: self.next_vehicle_id,
                kind: TransportKind::Boat,
                owner_lineage: tribe,
                x: hx,
                y: hy,
                occupants: Vec::new(),
                cargo: 0,
                route: Vec::new(),
                ready_tick: 0,
                harbour: Some((hx, hy)),
                bound_for: None,
                ferry: None,
            });
            self.next_vehicle_id += 1;
            fleet_total += 1;
        }
    }

    /// Steps each unmanned fleet boat along its route, and plans its next voyage when the route is done.
    fn move_fleet_boats(&mut self) {
        let home_bound = self.weather.kind == 2 || self.is_night();
        let now = self.tick_count;
        for i in 0..self.vehicles.len() {
            let v = &self.vehicles[i];
            if !(v.kind == TransportKind::Boat || v.kind == TransportKind::Ship) || !v.occupants.is_empty() {
                continue;
            }
            let Some(harbour) = v.harbour else { continue };
            let (id, at) = (v.id, (v.x, v.y));
            let may_plan = (now + id as u64).is_multiple_of(PLAN_TICKS);
            let on_water = self.grid.get(at.0, at.1) == Tile::Water;
            if home_bound {
                // Storm or dusk: moor at the harbour and stay there until the weather and the light allow.
                if at == harbour {
                    self.vehicles[i].route.clear();
                } else if may_plan && self.vehicles[i].route.first() != Some(&harbour) {
                    self.route_home(i, at, harbour);
                }
            } else if !on_water {
                // Set down on land by a crossing: put back out to the harbour in any light.
                if may_plan && self.vehicles[i].route.is_empty() {
                    self.route_home(i, at, harbour);
                }
            } else if may_plan && self.vehicles[i].route.is_empty() {
                match self.vehicles[i].bound_for {
                    Some(dest) if at == dest => self.unload_at(i, dest, harbour),
                    Some(dest) => {
                        self.plan_route(i, at, dest, TRADE_RANGE * 2);
                    }
                    None => self.plan_loop(i, at, harbour),
                }
            }
            if (now + id as u64).is_multiple_of(STEP_TICKS) {
                if let Some(&next) = self.vehicles[i].route.last() {
                    let tile = self.grid.get(next.0, next.1);
                    if tile == Tile::Water || (tile.walkable() && tile != Tile::Fire) {
                        self.vehicles[i].route.pop();
                        self.vehicles[i].x = next.0;
                        self.vehicles[i].y = next.1;
                        let home = self.vehicles[i].route.is_empty()
                            && self.vehicles[i].bound_for.is_none()
                            && (next.0, next.1) == harbour;
                        if home {
                            self.land_catch(harbour);
                        }
                    } else {
                        self.vehicles[i].route.clear();
                    }
                }
            }
        }
    }

    /// A water route from the boat (or from the water beside the land it is on) to the harbour.
    fn route_home(&mut self, i: usize, at: (i32, i32), harbour: (i32, i32)) {
        if self.grid.get(at.0, at.1) == Tile::Water {
            self.plan_route(i, at, harbour, HOME_RANGE);
        } else if let Some(water) = water_beside(&self.grid, at) {
            if self.plan_route(i, water, harbour, HOME_RANGE) {
                // The boat puts out from the land onto the water beside it first.
                self.vehicles[i].route.push(water);
            }
        }
    }

    /// Sets the route of vehicle `i` to a water route from `from` to `to`, searched in a box of
    /// `radius` around `to`. Returns false, and keeps the old route, when there is none.
    fn plan_route(&mut self, i: usize, from: (i32, i32), to: (i32, i32), radius: i32) -> bool {
        let Some(chart) = WaterChart::new(&self.grid, from, to, radius) else {
            return false;
        };
        let Some(route) = chart.route_to(to) else {
            return false;
        };
        self.vehicles[i].route = route;
        true
    }

    /// A fishing loop: a random water tile within reach of the harbour, two or more steps away.
    fn plan_loop(&mut self, i: usize, at: (i32, i32), harbour: (i32, i32)) {
        let Some(chart) = WaterChart::new(&self.grid, at, harbour, REACH) else {
            return;
        };
        let mut far: Vec<(i32, i32)> = (0..chart.steps.len())
            .filter(|&k| chart.steps[k] != u32::MAX && chart.steps[k] >= 2)
            .map(|k| chart.tile(k))
            .collect();
        if far.is_empty() {
            return;
        }
        let pick = ((self.rng.random::<f32>() * far.len() as f32) as usize).min(far.len() - 1);
        let target = far.swap_remove(pick);
        if let Some(route) = chart.route_to(target) {
            self.vehicles[i].route = route;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A lake with a grass shore on its western edge.
    fn lake_sim() -> Simulation {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        for y in 90..=110 {
            for x in 90..=120 {
                sim.grid.set(x, y, Tile::Water);
            }
        }
        for y in 88..=112 {
            for x in 80..=89 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim
    }

    /// Eight people of one tribe, a fisher among them, living on the shore at (89, 100).
    fn coastal_tribe(sim: &mut Simulation) -> String {
        sim.organisms.truncate(8);
        let lineage = sim.organisms[0].lineage_id.clone();
        for o in sim.organisms.iter_mut() {
            o.lineage_id = lineage.clone();
            o.alive = true;
            o.home_x = 89.0;
            o.home_y = 100.0;
        }
        sim.organisms[0].discover("fishing");
        lineage
    }

    fn boat(lineage: String, at: (i32, i32)) -> Vehicle {
        Vehicle {
            id: 5,
            kind: TransportKind::Boat,
            owner_lineage: lineage,
            x: at.0,
            y: at.1,
            occupants: Vec::new(),
            cargo: 0,
            route: Vec::new(),
            ready_tick: 0,
            harbour: Some((90, 100)),
            bound_for: None,
            ferry: None,
        }
    }

    #[test]
    fn a_coastal_tribe_moors_a_boat_at_its_harbour() {
        let mut sim = lake_sim();
        coastal_tribe(&mut sim);
        sim.vehicles.clear();
        sim.launch_fleet_boats();
        let fleet: Vec<&Vehicle> = sim.vehicles.iter().filter(|v| v.harbour.is_some()).collect();
        assert_eq!(fleet.len(), 1, "one boat for a tribe of eight");
        assert_eq!(fleet[0].harbour, Some((90, 100)));
        assert_eq!((fleet[0].x, fleet[0].y), (90, 100));
    }

    #[test]
    fn a_fleet_boat_sails_a_loop_by_day_and_moors_at_night() {
        let mut sim = lake_sim();
        let lineage = coastal_tribe(&mut sim);
        sim.vehicles = vec![boat(lineage, (90, 100))];
        sim.weather.kind = 0;
        // Day (tick 3100 is 100 into a 600-tick day): the boat sails out and stays on the water.
        sim.tick_count = 3_100;
        let mut away = false;
        for _ in 0..200 {
            sim.tick_count += 1;
            sim.move_fleet_boats();
            let v = &sim.vehicles[0];
            away |= (v.x, v.y) != (90, 100);
            assert_eq!(
                sim.grid.get(v.x, v.y),
                Tile::Water,
                "a fleet boat stays on the water"
            );
        }
        assert!(away, "a boat sails out in daylight");
        // Dusk (tick 6450 is 450 into a day): the boat makes for its mooring and lies there.
        sim.tick_count = 6_450;
        assert!(sim.is_night());
        for _ in 0..120 {
            sim.tick_count += 1;
            sim.move_fleet_boats();
        }
        let v = &sim.vehicles[0];
        assert_eq!(
            (v.x, v.y),
            (90, 100),
            "at night the boat is moored at its harbour"
        );
        assert!(v.route.is_empty());
    }

    #[test]
    fn a_storm_brings_a_fleet_boat_home_and_keeps_it_there() {
        let mut sim = lake_sim();
        let lineage = coastal_tribe(&mut sim);
        sim.vehicles = vec![boat(lineage, (100, 100))];
        sim.tick_count = 3_100;
        sim.weather.kind = 2;
        for _ in 0..120 {
            sim.tick_count += 1;
            sim.move_fleet_boats();
        }
        let v = &sim.vehicles[0];
        assert_eq!((v.x, v.y), (90, 100), "in a storm the boat comes home and stays");
    }

    #[test]
    fn a_boat_set_down_on_land_puts_back_out_to_its_harbour() {
        let mut sim = lake_sim();
        let lineage = coastal_tribe(&mut sim);
        // A grass islet in the lake, where a crossing put the boat ashore.
        sim.grid.set(95, 100, Tile::Grass);
        sim.vehicles = vec![boat(lineage, (95, 100))];
        sim.weather.kind = 0;
        sim.tick_count = 3_100;
        let mut reached = false;
        for _ in 0..120 {
            sim.tick_count += 1;
            sim.move_fleet_boats();
            reached |= (sim.vehicles[0].x, sim.vehicles[0].y) == (90, 100);
        }
        assert!(reached, "the boat finds its way back to the harbour");
    }

    #[test]
    fn the_frame_says_which_fleet_boats_are_under_way_and_where_they_are_moored() {
        let mut sim = lake_sim();
        let lineage = coastal_tribe(&mut sim);
        sim.vehicles = vec![boat(lineage, (92, 100))];
        sim.vehicles[0].route = vec![(91, 100), (90, 100)];
        let frame = sim.state_json();
        assert_eq!(frame["vehicles"][0]["sailing"], true);
        assert_eq!(frame["vehicles"][0]["harbour"], serde_json::json!([90, 100]));
        assert_eq!(
            frame["vehicles"][0]["shore"],
            serde_json::json!([-1, 0]),
            "the grass lies to the west"
        );
        sim.vehicles[0].route.clear();
        let frame = sim.state_json();
        assert_eq!(frame["vehicles"][0]["sailing"], false);
    }

    #[test]
    fn a_trade_boat_carries_food_across_the_water_to_another_tribe() {
        let mut sim = lake_sim();
        for y in 88..=112 {
            for x in 121..=130 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms.truncate(4);
        for (k, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = true;
            if k < 2 {
                o.lineage_id = "a".into();
                o.x = 89.0;
                o.y = 100.0;
                o.inv_food = 5;
            } else {
                o.lineage_id = "b".into();
                o.x = 121.0;
                o.y = 100.0;
                o.inv_food = 0;
            }
        }
        sim.vehicles = vec![
            boat("a".into(), (90, 100)),
            Vehicle {
                id: 6,
                kind: TransportKind::Boat,
                owner_lineage: "b".into(),
                x: 120,
                y: 100,
                occupants: Vec::new(),
                cargo: 0,
                route: Vec::new(),
                ready_tick: 0,
                harbour: Some((120, 100)),
                bound_for: None,
                ferry: None,
            },
        ];
        sim.weather.kind = 0;
        sim.tick_count = 3_000;
        sim.tick_trade();
        assert_eq!(
            sim.vehicles[0].cargo, TRADE_LOAD,
            "the boat takes food from its quay"
        );
        assert_eq!(sim.vehicles[0].bound_for, Some((120, 100)));
        assert_eq!(
            u32::from(sim.organisms[0].inv_food + sim.organisms[1].inv_food),
            10 - TRADE_LOAD,
            "the food leaves the home quay"
        );
        for _ in 0..400 {
            sim.tick_count += 1;
            sim.move_fleet_boats();
        }
        assert_eq!(
            u32::from(sim.organisms[2].inv_food + sim.organisms[3].inv_food),
            TRADE_LOAD,
            "the far quay receives the food"
        );
        assert_eq!(sim.vehicles[0].cargo, 0, "the hold is empty once it is delivered");
        assert_eq!(sim.vehicles[0].bound_for, None);
    }

    #[test]
    fn a_fishing_boat_that_comes_home_lands_its_catch_on_the_quay() {
        let mut sim = lake_sim();
        let lineage = coastal_tribe(&mut sim);
        for o in sim.organisms.iter_mut() {
            o.inv_food = 0;
        }
        sim.organisms[0].x = 89.0;
        sim.organisms[0].y = 100.0;
        sim.vehicles = vec![boat(lineage, (91, 100))];
        sim.vehicles[0].route = vec![(90, 100)];
        sim.weather.kind = 0;
        // Tick 1 is daylight, and this boat's step falls on it.
        sim.tick_count = 1;
        sim.move_fleet_boats();
        assert_eq!(
            (sim.vehicles[0].x, sim.vehicles[0].y),
            (90, 100),
            "the boat is home"
        );
        assert_eq!(
            sim.organisms[0].inv_food as u32, CATCH,
            "the catch lands on the quay"
        );
    }
}

#[cfg(test)]
mod ship_tests {
    use super::*;
    use crate::sim::era::Era;

    fn moored(sim: &mut Simulation, lineage: &str) {
        sim.vehicles.push(Vehicle {
            id: sim.next_vehicle_id,
            kind: TransportKind::Boat,
            owner_lineage: lineage.to_string(),
            x: 90,
            y: 100,
            occupants: Vec::new(),
            cargo: 0,
            route: Vec::new(),
            ready_tick: 0,
            harbour: Some((90, 100)),
            bound_for: None,
            ferry: None,
        });
        sim.next_vehicle_id += 1;
    }

    #[test]
    fn a_moored_boat_is_refitted_as_a_ship_once_its_tribe_reaches_the_classical_age() {
        let mut sim = Simulation::new(42);
        sim.vehicles.clear();
        moored(&mut sim, "old");
        moored(&mut sim, "young");
        sim.lineage_eras.insert("old".to_string(), Era::Classical);
        sim.lineage_eras.insert("young".to_string(), Era::Iron);
        sim.refit_ships();
        assert_eq!(sim.vehicles[0].kind, TransportKind::Ship);
        assert_eq!(sim.vehicles[1].kind, TransportKind::Boat);
        let frame = sim.state_json();
        assert_eq!(frame["vehicles"][0]["kind"], "ship");
    }

    #[test]
    fn a_steamship_is_drawn_with_the_steam_hull_of_its_industrial_owner() {
        let mut sim = Simulation::new(42);
        sim.vehicles.clear();
        moored(&mut sim, "iron");
        sim.lineage_eras.insert("iron".to_string(), Era::Industrial);
        sim.refit_ships();
        let frame = sim.state_json();
        assert_eq!(frame["vehicles"][0]["kind"], "ship");
        assert_eq!(frame["vehicles"][0]["era"], Era::Industrial.name());
    }
}
