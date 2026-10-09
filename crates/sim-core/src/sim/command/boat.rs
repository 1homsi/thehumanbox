use super::{clamp_cmd_coord, Simulation};
use crate::sim::transportation::{TransportKind, Vehicle};
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

/// Boats a world may hold before the boat tool is refused.
const MAX_BOATS: usize = 96;

impl Simulation {
    /// Sets a boat down on the water at (x, y), which must lie beside dry land. It belongs to the
    /// tribe of the living person nearest the spot (its era picks the hull; a log raft if no one
    /// lives), moors there, and fishes the coast like any harbour boat (see `tech/fleet.rs`).
    pub(super) fn cmd_place_boat(&mut self, x: i32, y: i32) -> bool {
        // Command coordinates are untrusted: clamp before any offset is added.
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        if !WorldGrid::in_bounds(x, y) || self.grid.get(x, y) != Tile::Water {
            return false;
        }
        let beside_land = [(0, -1), (0, 1), (-1, 0), (1, 0)].iter().any(|&(dx, dy)| {
            let (nx, ny) = (x + dx, y + dy);
            WorldGrid::in_bounds(nx, ny)
                && self.grid.get(nx, ny).walkable()
                && self.grid.get(nx, ny) != Tile::Water
        });
        let boats = self
            .vehicles
            .iter()
            .filter(|v| v.kind == TransportKind::Boat)
            .count();
        if !beside_land || boats >= MAX_BOATS {
            return false;
        }
        let owner = self
            .organisms
            .iter()
            .filter(|o| o.alive)
            .min_by_key(|o| (o.x as i32 - x).abs() + (o.y as i32 - y).abs())
            .map(|o| o.lineage_id.clone())
            .unwrap_or_default();
        self.vehicles.push(Vehicle {
            id: self.next_vehicle_id,
            kind: TransportKind::Boat,
            owner_lineage: owner,
            x,
            y,
            occupants: Vec::new(),
            cargo: 0,
            route: Vec::new(),
            ready_tick: 0,
            harbour: Some((x, y)),
        });
        self.next_vehicle_id += 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A lake from x 90 to 120 with grass on its western shore, and `people` people (the first ones of the world).
    fn lake(people: usize) -> Simulation {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        sim.organisms.truncate(people);
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

    #[test]
    fn a_boat_goes_on_the_water_beside_the_shore_and_moors_there() {
        let mut sim = lake(0);
        assert!(sim.cmd_place_boat(90, 100));
        let boat = sim.vehicles.last().expect("a boat was placed");
        assert_eq!((boat.x, boat.y), (90, 100));
        assert_eq!(boat.harbour, Some((90, 100)));
        assert_eq!(boat.owner_lineage, "", "no one lives here: a log raft");
    }

    #[test]
    fn the_boat_tool_needs_water_by_the_shore() {
        let mut sim = lake(0);
        assert!(!sim.cmd_place_boat(105, 100), "open water, far from land");
        assert!(!sim.cmd_place_boat(85, 100), "dry land");
        assert!(!sim.cmd_place_boat(-5, -5), "off the map");
        assert!(sim.vehicles.is_empty());
    }

    #[test]
    fn the_boat_belongs_to_the_nearest_person_s_tribe() {
        let mut sim = lake(2);
        sim.organisms[0].lineage_id = "far".into();
        sim.organisms[0].x = 80.0;
        sim.organisms[0].y = 100.0;
        sim.organisms[0].alive = true;
        sim.organisms[1].lineage_id = "near".into();
        sim.organisms[1].x = 89.0;
        sim.organisms[1].y = 99.0;
        sim.organisms[1].alive = true;
        assert!(sim.cmd_place_boat(90, 100));
        assert_eq!(sim.vehicles[0].owner_lineage, "near");
    }
}
