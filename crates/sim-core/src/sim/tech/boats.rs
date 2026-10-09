//! Small, bounded coastal voyages. Boat passengers still run normal metabolism.
use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;
use crate::sim::transportation::{TransportKind, Vehicle};
use crate::world::{grid::WorldGrid, tiles::Tile};

const CARDINAL: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];

/// Goods a passenger brings aboard: what they carry in hand (wood, stone and food).
/// Shown on the deck; it does not change how the crossing goes.
fn goods_carried(person: &Organism) -> u32 {
    u32::from(person.inv_wood) + u32::from(person.inv_stone) + u32::from(person.inv_food)
}

// Routes cross water to a dry shore; never cut across land or mountains.
fn crossing(grid: &WorldGrid, start: (i32, i32), minimum: i32) -> Option<Vec<(i32, i32)>> {
    for (dx, dy) in CARDINAL {
        let mut route = Vec::new();
        for distance in 1..=64 {
            let p = (start.0 + dx * distance, start.1 + dy * distance);
            if !WorldGrid::in_bounds(p.0, p.1) {
                break;
            }
            let tile = grid.get(p.0, p.1);
            if tile == Tile::Water {
                route.push(p);
            } else {
                if distance >= minimum && tile.walkable() && !matches!(tile, Tile::Fire | Tile::Flooded) {
                    route.push(p);
                    route.reverse();
                    return Some(route);
                }
                break;
            }
        }
    }
    None
}

/// How often coastal tribes look for unsettled land to colonise.
const COLONY_CHECK_TICKS: u64 = 400;
/// Longest sea route a colonising flotilla will attempt, in tiles.
const MAX_VOYAGE: i32 = 260;
/// Smallest landmass worth settling, in walkable tiles.
const MIN_COLONY_LAND: usize = 25;

impl Simulation {
    /// Coastal tribes send small flotillas to land nobody lives on (an
    /// island across the sea, or one the player raised). Each colonist
    /// sails their own boat along a water route that may bend around
    /// headlands; `boat_action` then carries them across tick by tick.
    pub(crate) fn tick_colonization(&mut self) {
        if !self.tick_count.is_multiple_of(COLONY_CHECK_TICKS) || self.tick_count == 0 {
            return;
        }
        let boats = self
            .vehicles
            .iter()
            .filter(|v| v.kind == TransportKind::Boat)
            .count();
        if boats >= 96 {
            return;
        }
        use crate::world::grid::{HEIGHT, WIDTH};
        let size = WIDTH * HEIGHT;
        // Landmasses, by walkable tiles, and who lives on each.
        let mut comp = vec![u32::MAX; size];
        let mut comp_size: Vec<usize> = Vec::new();
        for start in 0..size {
            let (sx, sy) = ((start % WIDTH) as i32, (start / WIDTH) as i32);
            if comp[start] != u32::MAX
                || !self.grid.get(sx, sy).walkable()
                || self.grid.get(sx, sy) == Tile::Water
            {
                continue;
            }
            let id = comp_size.len() as u32;
            let mut queue = std::collections::VecDeque::from([start]);
            comp[start] = id;
            let mut n = 0usize;
            while let Some(i) = queue.pop_front() {
                n += 1;
                let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
                for (dx, dy) in CARDINAL {
                    let (nx, ny) = (x + dx, y + dy);
                    if !WorldGrid::in_bounds(nx, ny) {
                        continue;
                    }
                    let ni = WorldGrid::idx(nx, ny);
                    let t = self.grid.get(nx, ny);
                    if comp[ni] == u32::MAX && t.walkable() && t != Tile::Water {
                        comp[ni] = id;
                        queue.push_back(ni);
                    }
                }
            }
            comp_size.push(n);
        }
        let mut residents = vec![0usize; comp_size.len()];
        for o in self.organisms.iter().filter(|o| o.alive) {
            let i = WorldGrid::idx(o.x as i32, o.y as i32);
            if comp[i] != u32::MAX {
                residents[comp[i] as usize] += 1;
            }
        }
        // Landmasses a boat is already heading for count as claimed.
        for v in self
            .vehicles
            .iter()
            .filter(|v| v.kind == TransportKind::Boat && !v.occupants.is_empty())
        {
            if let Some(&(lx, ly)) = v.route.first() {
                let i = WorldGrid::idx(lx, ly);
                if comp[i] != u32::MAX {
                    residents[comp[i] as usize] += 1;
                }
            }
        }
        let unsettled: Vec<bool> = comp_size
            .iter()
            .zip(&residents)
            .map(|(&n, &r)| n >= MIN_COLONY_LAND && r == 0)
            .collect();
        if !unsettled.iter().any(|&u| u) {
            return;
        }
        // Sea distance from every unsettled shore, with each water tile
        // pointing one step closer to landfall.
        let mut dist = vec![i32::MAX; size];
        let mut next = vec![usize::MAX; size];
        let mut queue = std::collections::VecDeque::new();
        for i in 0..size {
            let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            if self.grid.get(x, y) != Tile::Water {
                continue;
            }
            for (dx, dy) in CARDINAL {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let ni = WorldGrid::idx(nx, ny);
                if comp[ni] != u32::MAX && unsettled[comp[ni] as usize] {
                    dist[i] = 0;
                    next[i] = ni;
                    queue.push_back(i);
                    break;
                }
            }
        }
        while let Some(i) = queue.pop_front() {
            if dist[i] >= MAX_VOYAGE {
                continue;
            }
            let (x, y) = ((i % WIDTH) as i32, (i / WIDTH) as i32);
            for (dx, dy) in CARDINAL {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let ni = WorldGrid::idx(nx, ny);
                if dist[ni] == i32::MAX && self.grid.get(nx, ny) == Tile::Water {
                    dist[ni] = dist[i] + 1;
                    next[ni] = i;
                    queue.push_back(ni);
                }
            }
        }
        // The best-placed tribe that can build boats sends a party.
        let seafaring = |o: &crate::organism::organism::Organism| {
            ["fishing", "raft_building", "navigation", "sailing"]
                .iter()
                .any(|d| o.discoveries.contains(*d))
        };
        let mut launch: Option<(String, usize, i32)> = None;
        for (idx, o) in self.organisms.iter().enumerate() {
            if !o.alive || o.age < 700 || o.energy < 0.5 || o.hydration < 0.5 || !seafaring(o) {
                continue;
            }
            let (x, y) = (o.x as i32, o.y as i32);
            for (dx, dy) in CARDINAL {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let d = dist[WorldGrid::idx(nx, ny)];
                if d < i32::MAX && launch.as_ref().is_none_or(|l| d < l.2) {
                    launch = Some((o.lineage_id.clone(), idx, d));
                }
            }
        }
        let Some((lineage, leader, _)) = launch else {
            return;
        };
        let tribe_size = self
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .count();
        if tribe_size < 8 {
            return;
        }
        // The leader and up to five coastal kin nearby, men and women both
        // so the colony can grow.
        let (lx, ly) = (self.organisms[leader].x, self.organisms[leader].y);
        let mut party: Vec<usize> = vec![leader];
        for (idx, o) in self.organisms.iter().enumerate() {
            if party.len() >= 6 {
                break;
            }
            if idx == leader
                || !o.alive
                || o.age < 700
                || o.lineage_id != lineage
                || (o.x - lx).abs() + (o.y - ly).abs() > 10.0
            {
                continue;
            }
            party.push(idx);
        }
        if party.len() < 2 {
            return;
        }
        let mut sailed = 0;
        for &idx in &party {
            let (x, y) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            // Each colonist launches from water beside them, or from the
            // leader's launch point if they are a few steps inland.
            let start = CARDINAL
                .iter()
                .map(|&(dx, dy)| (x + dx, y + dy))
                .filter(|&(nx, ny)| WorldGrid::in_bounds(nx, ny) && dist[WorldGrid::idx(nx, ny)] < i32::MAX)
                .min_by_key(|&(nx, ny)| dist[WorldGrid::idx(nx, ny)]);
            let Some(mut at) = start else { continue };
            let mut route = vec![at];
            let mut i = WorldGrid::idx(at.0, at.1);
            while dist[i] > 0 {
                i = next[i];
                at = ((i % WIDTH) as i32, (i / WIDTH) as i32);
                route.push(at);
            }
            // Landfall on the far shore.
            let land = next[i];
            route.push(((land % WIDTH) as i32, (land / WIDTH) as i32));
            route.reverse();
            let id = self.organisms[idx].id.clone();
            self.vehicles.push(Vehicle {
                id: self.next_vehicle_id,
                kind: TransportKind::Boat,
                owner_lineage: lineage.clone(),
                x,
                y,
                occupants: vec![id],
                cargo: 0,
                route,
                ready_tick: self.tick_count + 24,
                harbour: None,
                bound_for: None,
            });
            self.next_vehicle_id += 1;
            self.organisms[idx].discover("raft_building");
            self.organisms[idx].journey = None;
            self.organisms[idx].think("building a boat to settle new land", self.tick_count);
            sailed += 1;
        }
        if sailed >= 2 {
            let name = self
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| lineage.clone());
            crate::sim::world_events::push_event(
                &mut self.events,
                self.tick_count,
                "discovery",
                &name,
                &format!("set sail with {sailed} boats to settle new land"),
            );
        }
    }

    /// At most one resident per tick searches for a crossing (256 tile probes).
    pub(crate) fn boat_action(&mut self, idx: usize) -> Option<(usize, Option<String>, &'static str)> {
        let person = &self.organisms[idx];
        let pos = (person.x as i32, person.y as i32);
        let existing = self
            .vehicles
            .iter()
            .position(|v| v.kind == TransportKind::Boat && v.occupants.first() == Some(&person.id));
        let boat_idx = if let Some(i) = existing {
            i
        } else {
            if self.organisms.is_empty()
                || self.tick_count % self.organisms.len() as u64 != idx as u64
                || person.age < person.max_age / 100 * 35
                || person.energy < 0.65
                || person.hydration < 0.65
                || person.fear_level > 0.4
                || self.grid.get(pos.0, pos.1) == Tile::Water
            {
                return None;
            }
            let reusable = self.vehicles.iter().position(|v| {
                v.kind == TransportKind::Boat
                    && v.occupants.is_empty()
                    && v.owner_lineage == person.lineage_id
                    && v.x == pos.0
                    && v.y == pos.1
                    && self.tick_count >= v.ready_tick
            });
            if reusable.is_none() && (person.inv_wood < 4 || self.vehicles.len() >= 128) {
                return None;
            }
            let route = crossing(&self.grid, pos, 8)?;
            let id = person.id.clone();
            if let Some(i) = reusable {
                self.vehicles[i].occupants.push(id);
                self.vehicles[i].route = route;
                self.vehicles[i].cargo = goods_carried(person);
                i
            } else {
                let lineage = person.lineage_id.clone();
                self.organisms[idx].inv_wood -= 4;
                self.organisms[idx].discover("raft_building");
                self.organisms[idx].log_event("built a wooden boat for a coastal crossing".into());
                let cargo = goods_carried(&self.organisms[idx]);
                let i = self.vehicles.len();
                self.vehicles.push(Vehicle {
                    id: self.next_vehicle_id,
                    kind: TransportKind::Boat,
                    owner_lineage: lineage,
                    x: pos.0,
                    y: pos.1,
                    occupants: vec![id],
                    cargo,
                    route,
                    ready_tick: self.tick_count + 24,
                    harbour: None,
                    bound_for: None,
                });
                self.next_vehicle_id += 1;
                i
            }
        };
        let boat = &mut self.vehicles[boat_idx];
        if self.tick_count < boat.ready_tick {
            return Some((22, Some("building a wooden boat".into()), "boat_build"));
        }
        // A storm keeps a boat that is out on the water in harbour until it passes.
        if self.weather.kind == 2 && !boat.route.is_empty() {
            return Some((22, Some("sheltering from the storm".into()), "boat_wait"));
        }
        if let Some(&(x, y)) = boat.route.last() {
            let tile = self.grid.get(x, y);
            if (x - pos.0).abs() + (y - pos.1).abs() != 1 || !tile.walkable() || tile == Tile::Fire {
                // Replan to a nearby shore after a terrain edit; never teleport passengers.
                if let Some(route) = crossing(&self.grid, pos, 1) {
                    boat.route = route;
                }
                return Some((22, Some("waiting for a clear water passage".into()), "boat_wait"));
            }
            let action = CARDINAL
                .iter()
                .position(|&(dx, dy)| (pos.0 + dx, pos.1 + dy) == (x, y))
                .unwrap();
            if tile != Tile::Water {
                boat.route.clear();
            } else {
                boat.route.pop();
            }
            boat.x = x;
            boat.y = y;
            if boat.route.is_empty() {
                boat.occupants.clear();
                boat.ready_tick = self.tick_count + 300;
                self.organisms[idx].home_x = x as f32;
                self.organisms[idx].home_y = y as f32;
                self.organisms[idx].wander_target = None;
                self.organisms[idx].log_event("landed on a new shore by boat".into());
                return Some((action, Some("landing on a new shore".into()), "boat_travel"));
            }
            Some((action, Some("sailing to another shore".into()), "boat_travel"))
        } else {
            boat.occupants.clear();
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_coastal_tribe_sails_to_settle_an_empty_island() {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        // A mainland strip, a strait, and an empty island to the south-east
        // that no straight crossing reaches.
        use crate::world::grid::{HEIGHT, WIDTH};
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                sim.grid.set(x, y, Tile::Water);
                sim.grid.depth[WorldGrid::idx(x, y)] = 0.3;
            }
        }
        for y in 70..=90 {
            for x in 70..=110 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for y in 110..=125 {
            for x in 160..=180 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms.truncate(10);
        let lineage = sim.organisms[0].lineage_id.clone();
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.lineage_id = lineage.clone();
            o.x = 105.0 + (i % 5) as f32;
            o.y = 90.0;
            o.age = 2_000;
            o.energy = 1.0;
            o.hydration = 1.0;
            o.health = 1.0;
            o.discoveries.insert("fishing".into());
        }
        sim.tick_count = COLONY_CHECK_TICKS;
        sim.tick_colonization();
        let boats = sim
            .vehicles
            .iter()
            .filter(|v| v.kind == TransportKind::Boat)
            .count();
        assert!(boats >= 2, "a flotilla should launch, got {boats} boats");
        for _ in 0..600 {
            sim.tick();
        }
        let settlers = sim
            .organisms
            .iter()
            .filter(|o| o.alive && (160.0..=180.0).contains(&o.x) && (110.0..=125.0).contains(&o.y))
            .count();
        assert!(
            settlers >= 2,
            "colonists should land on the island, {settlers} did"
        );
    }
    #[test]
    fn crossing_requires_water_and_reachable_dry_shore() {
        let mut sim = Simulation::new(42);
        for y in 90..=110 {
            for x in 90..=120 {
                sim.grid.set(x, y, Tile::Rock);
            }
        }
        sim.grid.set(100, 100, Tile::Grass);
        for x in 101..108 {
            sim.grid.set(x, 100, Tile::Water);
        }
        sim.grid.set(108, 100, Tile::Grass);
        let route = crossing(&sim.grid, (100, 100), 8).unwrap();
        assert_eq!(route.last(), Some(&(101, 100)));
        assert_eq!(route.first(), Some(&(108, 100)));
        sim.grid.set(104, 100, Tile::Rock);
        assert!(crossing(&sim.grid, (100, 100), 8).is_none());
    }
    #[test]
    fn resident_builds_crosses_and_lands_without_swimming_damage() {
        let mut sim = Simulation::new(42);
        sim.organisms.truncate(1);
        sim.animals.clear();
        for y in 90..=110 {
            for x in 90..=120 {
                sim.grid.set(x, y, Tile::Rock);
            }
        }
        sim.grid.set(100, 100, Tile::Grass);
        for x in 101..108 {
            sim.grid.set(x, 100, Tile::Water);
        }
        sim.grid.set(108, 100, Tile::Grass);
        let person = &mut sim.organisms[0];
        person.x = 100.;
        person.y = 100.;
        person.age = person.max_age / 2;
        person.inv_wood = 4;
        person.energy = 1.;
        person.hydration = 1.;
        person.health = 1.;
        sim.tick();
        assert_eq!(sim.vehicles.len(), 1);
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.organisms[0].x, 100.);
        for _ in 0..26 {
            sim.tick();
        }
        let saved = serde_json::to_string(&sim.to_save_state()).unwrap();
        let mut sim = Simulation::from_save(42, serde_json::from_str(&saved).unwrap());
        for _ in 0..5 {
            sim.tick();
        }
        assert_eq!(sim.organisms[0].x, 108.);
        assert_eq!(sim.organisms[0].water_ticks, 0);
        assert!(sim.organisms[0].health > 0.9);
        assert!(sim.vehicles[0].occupants.is_empty());
        assert_eq!(sim.vehicles[0].x, 108);
        let frame = sim.state_json();
        assert_eq!(frame["vehicles"][0]["kind"], "boat");
    }
}

#[cfg(test)]
mod storm_tests {
    use super::*;

    #[test]
    fn a_boat_on_the_water_sits_out_a_storm_then_sails_on() {
        let mut sim = Simulation::new(0x5708);
        let person = sim.organisms[0].id.clone();
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.organisms[0].x = 45.0;
        sim.organisms[0].y = 45.0;
        sim.vehicles.clear();
        sim.vehicles.push(Vehicle {
            id: 1,
            kind: TransportKind::Boat,
            owner_lineage: lineage,
            x: 45,
            y: 45,
            occupants: vec![person],
            cargo: 0,
            route: vec![(46, 45)],
            ready_tick: 0,
            harbour: None,
            bound_for: None,
        });
        sim.tick_count = 500;
        sim.weather.kind = 2;
        let (_, thought, origin) = sim.boat_action(0).expect("the passenger is aboard");
        assert_eq!(origin, "boat_wait");
        assert_eq!(thought.as_deref(), Some("sheltering from the storm"));
        assert_eq!(
            (sim.vehicles[0].x, sim.vehicles[0].y),
            (45, 45),
            "the boat holds still"
        );

        sim.weather.kind = 0;
        let (_, thought, _) = sim.boat_action(0).expect("the passenger is aboard");
        assert_ne!(thought.as_deref(), Some("sheltering from the storm"));
    }
}

#[cfg(test)]
mod deck_tests {
    use super::*;

    #[test]
    fn a_boat_takes_on_its_passengers_goods_and_the_frame_names_its_owners_era() {
        let mut sim = Simulation::new(42);
        sim.organisms.truncate(1);
        sim.animals.clear();
        for y in 95..=105 {
            for x in 95..=120 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for x in 101..=110 {
            sim.grid.set(x, 100, Tile::Water);
        }
        let lineage = sim.organisms[0].lineage_id.clone();
        let person = &mut sim.organisms[0];
        person.x = 100.;
        person.y = 100.;
        person.age = person.max_age / 2;
        person.energy = 1.;
        person.hydration = 1.;
        person.health = 1.;
        person.inv_wood = 2;
        person.inv_food = 1;
        sim.vehicles.push(Vehicle {
            id: 7,
            kind: TransportKind::Boat,
            owner_lineage: lineage,
            x: 100,
            y: 100,
            occupants: Vec::new(),
            cargo: 0,
            route: Vec::new(),
            ready_tick: 0,
            harbour: None,
            bound_for: None,
        });
        let (_, _, origin) = sim.boat_action(0).expect("a resident takes the moored boat");
        assert_eq!(origin, "boat_travel");
        assert_eq!(sim.vehicles[0].cargo, 3, "wood and food come aboard");
        let frame = sim.state_json();
        assert_eq!(frame["vehicles"][0]["era"], "pre-stone");
        assert_eq!(frame["vehicles"][0]["cargo"], 3);
    }
}
