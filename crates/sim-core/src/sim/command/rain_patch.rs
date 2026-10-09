use super::Simulation;
use crate::math::DetMath;
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

/// How wide a rain cloud's patch is, in tiles, unless the radius says otherwise.
const DEFAULT_RADIUS: f32 = 6.0;
const MAX_RADIUS: f32 = 20.0;
/// How much of a drink a person in the patch takes from the rain (hydration is capped at full).
const DRINK: f32 = 0.5;

impl Simulation {
    /// A rain cloud bursts over a patch of the land: fires in it go out (leaving ash), and the people
    /// in it drink from the rain. Returns false when there was no fire to put out and nobody in reach.
    pub(super) fn cmd_rain_patch(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_RADIUS)
        } else {
            DEFAULT_RADIUS
        };
        let (cx, cy) = (x as i32, y as i32);
        let r = reach.ceil() as i32;
        let mut doused = 0usize;
        for dx in -r..=r {
            for dy in -r..=r {
                if (dx * dx + dy * dy) as f32 > reach * reach {
                    continue;
                }
                let (ix, iy) = (cx + dx, cy + dy);
                if WorldGrid::in_bounds(ix, iy) && self.grid.get(ix, iy) == Tile::Fire {
                    self.grid.set(ix, iy, Tile::Ash);
                    *self.grid.fire_intensity_mut(ix, iy) = 0.0;
                    doused += 1;
                }
            }
        }
        let mut drinkers = 0usize;
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if (o.x - x).det_hypot(o.y - y) <= reach {
                o.hydration = (o.hydration + DRINK).min(1.0);
                drinkers += 1;
            }
        }
        if doused + drinkers == 0 {
            return false;
        }
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "weather",
            "the sky",
            &format!(
                "a rain cloud burst over ({x:.0}, {y:.0}): {doused} fires went out, {drinkers} people drank"
            ),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::world::tiles::Tile;

    fn only_person_at(sim: &mut Simulation, x: f32, y: f32, hydration: f32) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = x;
        sim.organisms[0].y = y;
        sim.organisms[0].hydration = hydration;
    }

    #[test]
    fn a_rain_patch_puts_out_the_fires_inside_it_and_no_others() {
        let mut sim = Simulation::new(51);
        only_person_at(&mut sim, 200.0, 200.0, 0.0);
        sim.grid.set(50, 50, Tile::Fire);
        sim.grid.set(150, 150, Tile::Fire);
        assert!(sim.apply_command_json(r#"{"cmd":"rain_patch","x":50.0,"y":50.0,"radius":4.0}"#));
        assert_eq!(sim.grid.get(50, 50), Tile::Ash, "the fire in the patch is out");
        assert_eq!(sim.grid.get(150, 150), Tile::Fire, "a fire far away still burns");
    }

    #[test]
    fn people_in_the_patch_drink_and_people_outside_do_not() {
        let mut sim = Simulation::new(51);
        only_person_at(&mut sim, 60.0, 60.0, 0.1);
        assert!(sim.apply_command_json(r#"{"cmd":"rain_patch","x":60.0,"y":60.0,"radius":5.0}"#));
        assert!(
            sim.organisms[0].hydration > 0.5,
            "the person under the cloud drinks"
        );
        let mut far = Simulation::new(51);
        only_person_at(&mut far, 200.0, 200.0, 0.1);
        far.grid.set(60, 60, Tile::Fire);
        assert!(far.apply_command_json(r#"{"cmd":"rain_patch","x":60.0,"y":60.0,"radius":5.0}"#));
        assert_eq!(
            far.organisms[0].hydration, 0.1,
            "the person far away does not drink"
        );
    }

    #[test]
    fn a_rain_patch_over_dry_empty_ground_changes_nothing() {
        let mut sim = Simulation::new(51);
        only_person_at(&mut sim, 200.0, 200.0, 0.1);
        assert!(!sim.apply_command_json(r#"{"cmd":"rain_patch","x":20.0,"y":20.0,"radius":3.0}"#));
    }
}
