use super::Simulation;
use crate::math::DetMath;
use crate::organism::organism::Harm;
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

/// How far from the click the land is swept, in tiles, unless the radius says otherwise.
const DEFAULT_RADIUS: f32 = 4.0;
const MAX_RADIUS: f32 = 24.0;

impl Simulation {
    /// Wipes everything living in a brush area: people (who die through the normal tick, so kin grieve),
    /// animals, plantings and wild food on the ground. Buildings are left alone (demolish clears those).
    /// Returns false when there was nothing in the area to clear.
    pub(super) fn cmd_clear_region(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_RADIUS)
        } else {
            DEFAULT_RADIUS
        };
        let now = self.tick_count;
        let mut people = 0usize;
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if (o.x - x).det_hypot(o.y - y) <= reach {
                o.health = -1.0;
                o.mark_harm(Harm::Disaster, now);
                people += 1;
            }
        }
        let mut animals = 0usize;
        for a in self.animals.iter_mut().filter(|a| a.alive) {
            if (a.x - x).det_hypot(a.y - y) <= reach {
                a.alive = false;
                animals += 1;
            }
        }
        let (cx, cy) = (x as i32, y as i32);
        let r = reach.ceil() as i32;
        let mut plants = 0usize;
        for dx in -r..=r {
            for dy in -r..=r {
                if (dx * dx + dy * dy) as f32 > reach * reach {
                    continue;
                }
                let (ix, iy) = (cx + dx, cy + dy);
                if !WorldGrid::in_bounds(ix, iy) {
                    continue;
                }
                if self.plantings.remove(&(WorldGrid::idx(ix, iy) as u32)).is_some() {
                    plants += 1;
                }
                if self.grid.get(ix, iy) == Tile::Food {
                    self.grid.set(ix, iy, Tile::Grass);
                    plants += 1;
                }
            }
        }
        if people + animals + plants == 0 {
            return false;
        }
        push_event(
            &mut self.events,
            now,
            "clear",
            "world",
            &format!(
                "{people} people, {animals} animals and {plants} plantings were swept from ({x:.0}, {y:.0})"
            ),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::world::tiles::Tile;

    fn only_person_at(sim: &mut Simulation, who: &[(f32, f32)]) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
            o.health = 1.0;
        }
        for (k, &(x, y)) in who.iter().enumerate() {
            sim.organisms[k].alive = true;
            sim.organisms[k].x = x;
            sim.organisms[k].y = y;
            sim.organisms[k].health = 1.0;
        }
    }

    #[test]
    fn clearing_a_region_strikes_down_the_people_inside_and_spares_the_rest() {
        let mut sim = Simulation::new(31);
        only_person_at(&mut sim, &[(60.0, 60.0), (61.0, 60.0), (150.0, 150.0)]);
        assert!(sim.apply_command_json(r#"{"cmd":"clear_region","x":60.0,"y":60.0,"radius":4.0}"#));
        assert!(sim.organisms[0].health < 0.0, "the person under the brush dies");
        assert!(sim.organisms[1].health < 0.0, "so does the one beside them");
        assert_eq!(sim.organisms[2].health, 1.0, "the person far away is untouched");
    }

    #[test]
    fn clearing_a_region_with_nothing_in_it_changes_nothing() {
        let mut sim = Simulation::new(31);
        only_person_at(&mut sim, &[(150.0, 150.0)]);
        for a in sim.animals.iter_mut() {
            a.alive = false;
        }
        // Bare ground around (10, 10): no wild food and no plantings for the sweep to take.
        sim.plantings.clear();
        for dx in -3..=3 {
            for dy in -3..=3 {
                sim.grid.set(10 + dx, 10 + dy, Tile::Grass);
            }
        }
        assert!(!sim.apply_command_json(r#"{"cmd":"clear_region","x":10.0,"y":10.0,"radius":3.0}"#));
        assert_eq!(sim.organisms[0].health, 1.0);
    }
}
