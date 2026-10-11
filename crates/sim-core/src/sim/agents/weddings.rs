//! Weddings. When two people pair, the people of their tribe who are already close to the couple's home come over
//! to see it: up to `GUESTS` adults within `GUEST_REACH` tiles walk to the home and stand near the couple for a
//! while (their thought reads "at a wedding"). Only people already near walk, so the tribe does not bunch up.

use super::age_stage::AgeStage;
use super::family_outings::{chebyshev, spread};
use crate::sim::simulation::Simulation;

/// At most this many guests come to a wedding.
const GUESTS: usize = 6;
/// Only people this close to the home (in tiles) come over.
const GUEST_REACH: i32 = 8;

impl Simulation {
    /// Sends the nearest fit adults of the couple's tribe to the couple's home, once, when they pair.
    pub(crate) fn gather_wedding(&mut self, a: usize, b: usize) {
        let tick = self.tick_count;
        let home = (self.organisms[a].home_x as i32, self.organisms[a].home_y as i32);
        let lineage = self.organisms[a].lineage_id.clone();
        let mut guests: Vec<(i32, usize)> = Vec::new();
        for (i, o) in self.organisms.iter().enumerate() {
            if i == a
                || i == b
                || !o.alive
                || o.lineage_id != lineage
                || o.journey.is_some()
                || o.wander_target.is_some()
                || o.energy < 0.35
                || o.hydration < 0.35
                || o.fear_level > 0.5
                || matches!(o.age_stage(), AgeStage::Infant | AgeStage::Child)
            {
                continue;
            }
            let here = (o.x as i32, o.y as i32);
            let d = chebyshev(here, home);
            if d <= GUEST_REACH {
                guests.push((d, i));
            }
        }
        guests.sort_unstable();
        for (_, i) in guests.into_iter().take(GUESTS) {
            let target = (home.0 + spread(i, tick, 11, 2), home.1 + spread(i, tick, 12, 2));
            if self.set_outing_target(i, target) {
                self.organisms[i].think("at a wedding", tick);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::tiles::Tile;

    /// Eight adults of one tribe on open grass around (100, 100): the couple are 0 and 1 at home.
    fn village() -> Simulation {
        let mut sim = Simulation::new(94);
        sim.organisms.truncate(8);
        for x in 80..=130 {
            for y in 80..=120 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = true;
            o.lineage_id = "clan".into();
            o.energy = 0.9;
            o.hydration = 0.9;
            o.health = 0.9;
            o.age = 2000;
            o.max_age = 4000;
            o.journey = None;
            o.wander_target = None;
            o.home_x = 100.0;
            o.home_y = 100.0;
            o.x = 100.0 + i as f32;
            o.y = 100.0;
            o.fear_level = 0.0;
        }
        sim.organisms[0].x = 100.0;
        sim.organisms[1].x = 101.0;
        sim.organisms[7].x = 125.0;
        sim.organisms[7].home_x = 125.0;
        sim
    }

    #[test]
    fn neighbours_come_to_the_wedding_and_far_people_stay() {
        let mut sim = village();
        sim.gather_wedding(0, 1);
        let near = sim.organisms[2].wander_target.expect("a neighbour comes over");
        assert!(chebyshev(near, (100, 100)) <= 3, "target {near:?}");
        assert!(sim.organisms[7].wander_target.is_none(), "someone far off stays");
        assert!(sim.organisms[0].wander_target.is_none(), "the couple do not walk");
    }

    #[test]
    fn no_more_than_six_guests_come() {
        let mut sim = village();
        sim.gather_wedding(0, 1);
        let guests = sim.organisms.iter().filter(|o| o.wander_target.is_some()).count();
        assert!(guests <= GUESTS, "guests {guests}");
    }
}
