//! Small, bounded coastal voyages. Boat passengers still run normal metabolism.
use crate::sim::simulation::Simulation;
use crate::sim::transportation::{TransportKind, Vehicle};
use crate::world::{grid::WorldGrid, tiles::Tile};

const CARDINAL: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];

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

impl Simulation {
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
                i
            } else {
                let lineage = person.lineage_id.clone();
                self.organisms[idx].inv_wood -= 4;
                self.organisms[idx].discover("raft_building");
                self.organisms[idx].log_event("built a wooden boat for a coastal crossing".into());
                let i = self.vehicles.len();
                self.vehicles.push(Vehicle {
                    id: self.next_vehicle_id,
                    kind: TransportKind::Boat,
                    owner_lineage: lineage,
                    x: pos.0,
                    y: pos.1,
                    occupants: vec![id],
                    cargo: 0,
                    route,
                    ready_tick: self.tick_count + 24,
                });
                self.next_vehicle_id += 1;
                i
            }
        };
        let boat = &mut self.vehicles[boat_idx];
        if self.tick_count < boat.ready_tick {
            return Some((22, Some("building a wooden boat".into()), "boat_build"));
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
