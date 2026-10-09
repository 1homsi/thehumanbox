use super::{clamp_cmd_coord, Simulation};
use crate::sim::era::Era;
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;

/// Radius of the crater the bomb leaves, in tiles.
const CRATER_RADIUS: i32 = 6;
/// Radius the fallout settles over, in tiles: everyone in it is poisoned and the plantings wither.
const FALLOUT_RADIUS: i32 = 16;

impl Simulation {
    /// A bomb falls on the point: a crater where it lands (as a meteor leaves), fallout that sickens
    /// everyone in a wide ring, and blight across the plantings there. Only a tribe that has reached
    /// the Industrial age can build one, so before that it returns false and changes nothing.
    pub(super) fn cmd_nuke(&mut self, x: i32, y: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        if !WorldGrid::in_bounds(x, y) {
            return false;
        }
        if !self.lineage_eras.values().any(|era| *era >= Era::Industrial) {
            return false;
        }
        self.cmd_meteor(x, y, CRATER_RADIUS);
        self.cmd_poison(x as f32, y as f32, FALLOUT_RADIUS as f32);
        self.cmd_blight(x, y, FALLOUT_RADIUS);
        let tick = self.tick_count;
        push_event(
            &mut self.events,
            tick,
            "disaster",
            "world",
            &format!("a bomb fell at ({x}, {y}) and fallout settles on the land around it"),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::era::Era;
    use crate::sim::simulation::Simulation;

    fn all_people_at(sim: &mut Simulation, x: f32, y: f32) {
        for o in sim.organisms.iter_mut() {
            o.alive = true;
            o.x = x;
            o.y = y;
            o.infection = 0.0;
        }
    }

    #[test]
    fn a_bomb_is_refused_before_the_industrial_age() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 120.0, 120.0);
        sim.lineage_eras.insert("tribe-a".to_string(), Era::Iron);
        assert!(!sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
        assert!(sim.organisms.iter().all(|o| o.infection == 0.0), "no fallout");
    }

    #[test]
    fn a_bomb_craters_the_point_and_poisons_people_in_the_fallout_ring_once_a_tribe_is_industrial() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 120.0, 120.0);
        // One person stands in the fallout ring, outside the crater.
        sim.organisms[1].x = 130.0;
        sim.lineage_eras.insert("tribe-a".to_string(), Era::Industrial);
        assert!(sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
        // A meteor marks the person at the point for death (health below zero); the tick records the death.
        assert!(
            sim.organisms[0].health < 0.0,
            "the crater takes the person at the point"
        );
        assert!(
            sim.organisms[1].alive,
            "the fallout ring spares the person outside the crater"
        );
        assert!(sim.organisms[1].infection >= 0.85, "and poisons them");
    }
}
