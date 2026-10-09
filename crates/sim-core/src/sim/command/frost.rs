use super::{clamp_cmd_coord, Simulation};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

impl Simulation {
    /// Freezes the water inside the radius (deep and shallow alike) into ice. It melts back to water
    /// when the warm season comes (see `world_events::ice`). Returns false when no water is there.
    pub(super) fn cmd_freeze(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = if radius <= 0 { 4 } else { radius.min(24) };
        let mut frozen = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                if self.grid.get(nx, ny) == Tile::Water {
                    self.grid.set(nx, ny, Tile::Ice);
                    frozen += 1;
                }
            }
        }
        if frozen > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "weather",
                "the water",
                "the water in the brush turns to ice",
            );
        }
        frozen > 0
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::world::tiles::Tile;

    #[test]
    fn freeze_turns_only_the_water_in_reach_to_ice() {
        let mut sim = Simulation::new(42);
        for dx in -2..=2 {
            for dy in -2..=2 {
                sim.grid.set(400 + dx, 150 + dy, Tile::Water);
            }
        }
        sim.grid.set(400, 150, Tile::Water);
        sim.grid.set(420, 150, Tile::Water);
        assert!(sim.apply_command_json(r#"{"cmd":"freeze","x":400,"y":150,"radius":2}"#));
        assert_eq!(sim.grid.get(400, 150), Tile::Ice);
        assert_eq!(sim.grid.get(401, 149), Tile::Ice);
        assert_eq!(
            sim.grid.get(420, 150),
            Tile::Water,
            "water out of reach stays open"
        );
        for dx in -3..=3 {
            for dy in -3..=3 {
                sim.grid.set(50 + dx, 50 + dy, Tile::Grass);
            }
        }
        assert!(!sim.apply_command_json(r#"{"cmd":"freeze","x":50,"y":50,"radius":2}"#));
    }
}
