use super::Simulation;
use crate::math::DetMath;
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Tile;

/// How far from the clicked point a person may be and still be the one moved, in tiles.
const DEFAULT_REACH: f32 = 4.0;
const MAX_REACH: f32 = 16.0;

impl Simulation {
    /// Move the living person nearest the point (within `radius` tiles, four by default) onto it.
    /// Water, rock and the void are not somewhere a person can stand, so nothing moves there.
    /// Returns false when nobody is in reach or the spot is not walkable.
    pub(super) fn cmd_teleport(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_REACH)
        } else {
            DEFAULT_REACH
        };
        let x = x.clamp(0.0, WIDTH as f32 - 1.0);
        let y = y.clamp(0.0, HEIGHT as f32 - 1.0);
        if matches!(
            self.grid.get(x as i32, y as i32),
            Tile::Water | Tile::Rock | Tile::Void
        ) {
            return false;
        }
        let nearest = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (i, (o.x - x).det_hypot(o.y - y)))
            .filter(|&(_, d)| d <= reach)
            .min_by(|a, b| a.1.total_cmp(&b.1));
        let Some((i, _)) = nearest else {
            return false;
        };
        let person = &mut self.organisms[i];
        person.x = x;
        person.y = y;
        person.wander_target = None;
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::world::tiles::Tile;

    fn only_these_alive(sim: &mut Simulation, people: &[(f32, f32)]) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        for (k, &(x, y)) in people.iter().enumerate() {
            sim.organisms[k].alive = true;
            sim.organisms[k].x = x;
            sim.organisms[k].y = y;
        }
    }

    #[test]
    fn teleport_moves_only_the_nearest_person_in_reach() {
        let mut sim = Simulation::new(2);
        only_these_alive(&mut sim, &[(116.0, 116.0), (200.0, 200.0)]);
        sim.grid.set(120, 120, Tile::Grass);
        assert!(sim.apply_command_json(r#"{"cmd":"teleport","x":120.0,"y":120.0,"radius":8.0}"#));
        assert_eq!((sim.organisms[0].x, sim.organisms[0].y), (120.0, 120.0));
        assert_eq!((sim.organisms[1].x, sim.organisms[1].y), (200.0, 200.0));
    }

    #[test]
    fn teleport_reports_nobody_in_reach_and_refuses_water() {
        let mut sim = Simulation::new(2);
        only_these_alive(&mut sim, &[(50.0, 50.0)]);
        sim.grid.set(60, 60, Tile::Grass);
        assert!(
            !sim.apply_command_json(r#"{"cmd":"teleport","x":60.0,"y":60.0}"#),
            "no one within four tiles"
        );
        assert_eq!((sim.organisms[0].x, sim.organisms[0].y), (50.0, 50.0));

        sim.grid.set(51, 51, Tile::Water);
        assert!(
            !sim.apply_command_json(r#"{"cmd":"teleport","x":51.0,"y":51.0,"radius":4.0}"#),
            "water is not standable"
        );
        assert_eq!((sim.organisms[0].x, sim.organisms[0].y), (50.0, 50.0));
    }
}
