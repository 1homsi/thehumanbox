//! Hunted game grows wary. Every animal people catch makes the rest in that
//! stretch of land more skittish: they bolt from people further off and are
//! harder to get close to. Hunters who keep taking game near home find it
//! slipping away and have to range further; left alone, the animals settle
//! again: a lightly hunted patch in days, the most hunted in under a month.
//!
//! Kept per patch of land and saved with the world.

use super::Simulation;
use crate::hashing::FxHashMap as HashMap;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::world_events::push_event;

/// The side of a patch of land, in tiles.
pub const PATCH: i32 = 16;
/// How much one catch adds to the wariness of its patch.
const PER_CATCH: f32 = 0.12;
/// How much wariness fades each day.
const DAILY_FADE: f32 = 0.04;
/// Game this wary is told of, and hunters notice it.
pub const WARY: f32 = 0.6;
/// How much harder the warest game is to catch: half the usual chance.
pub const ESCAPE_AT_FULL: f32 = 0.5;

pub fn patch(x: f32, y: f32) -> (i32, i32) {
    ((x as i32).div_euclid(PATCH), (y as i32).div_euclid(PATCH))
}

/// How wary the game is at (`x`, `y`), 0 to 1.
pub fn wariness_in(map: &HashMap<(i32, i32), f32>, x: f32, y: f32) -> f32 {
    map.get(&patch(x, y)).copied().unwrap_or(0.0)
}

impl Simulation {
    pub(crate) fn game_wariness(&self, x: f32, y: f32) -> f32 {
        wariness_in(&self.game_wariness, x, y)
    }

    /// `hunter` took an animal at (`x`, `y`): the rest of the game there grows warier.
    pub(crate) fn spook_game(&mut self, x: f32, y: f32, hunter: usize) {
        let entry = self.game_wariness.entry(patch(x, y)).or_insert(0.0);
        let before = *entry;
        *entry = (*entry + PER_CATCH).min(1.0);
        if before >= WARY || *entry < WARY {
            return;
        }
        let tick = self.tick_count;
        self.organisms[hunter].think("the game here has grown wary", tick);
        let lineage = self.organisms[hunter].lineage_id.clone();
        let name = self.tribe_name(&lineage);
        push_event(
            &mut self.events,
            tick,
            "life",
            &name,
            "find the game near them grown wary of their hunters",
        );
    }

    /// Once a day, the game everywhere settles a little.
    pub(crate) fn tick_game_wariness(&mut self) {
        if self.tick_count % DAY_LENGTH != DAY_LENGTH / 3 {
            return;
        }
        self.game_wariness.retain(|_, w| {
            *w -= DAILY_FADE;
            *w > 0.0
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::animal::{Animal, AnimalKind};
    use rand::SeedableRng;

    #[test]
    fn catches_make_a_patch_wary_and_it_settles_over_days() {
        let mut sim = Simulation::new(11);
        for _ in 0..6 {
            sim.spook_game(40.0, 40.0, 0);
        }
        assert!(sim.game_wariness(41.0, 47.0) >= WARY, "same patch");
        assert_eq!(sim.game_wariness(40.0 + PATCH as f32, 40.0), 0.0, "next patch");
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.contains("grown wary of their hunters")));
        let mut days = 0;
        while sim.game_wariness(40.0, 40.0) > 0.0 {
            days += 1;
            sim.tick_count = DAY_LENGTH * days + DAY_LENGTH / 3;
            sim.tick_game_wariness();
        }
        assert!((10..=20).contains(&days), "wary for {days} days");

        // The most hunted patch takes longer, but settles within a month.
        for _ in 0..20 {
            sim.spook_game(40.0, 40.0, 0);
        }
        assert_eq!(sim.game_wariness(40.0, 40.0), 1.0);
        let start = days;
        while sim.game_wariness(40.0, 40.0) > 0.0 {
            days += 1;
            sim.tick_count = DAY_LENGTH * days + DAY_LENGTH / 3;
            sim.tick_game_wariness();
        }
        assert!(days - start <= 30, "wary for {} days", days - start);
    }

    #[test]
    fn wary_game_bolts_from_further_off() {
        let mut grid = crate::world::grid::WorldGrid::new(4);
        for x in 40..=60 {
            for y in 40..=60 {
                grid.set(x, y, crate::world::tiles::Tile::Grass);
            }
        }
        let person = [(55.0, 50.0)];
        let mut calm = Animal::new(1, 50.0, 50.0, AnimalKind::Deer);
        let mut wary = Animal::new(2, 50.0, 50.0, AnimalKind::Deer);
        wary.wary = 1.0;
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(1);
        calm.tick(&grid, &person, &[], &[], &mut rng);
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(1);
        wary.tick(&grid, &person, &[], &[], &mut rng);
        assert!(wary.x < 50.0, "the wary deer ran from the person 5 tiles off");
        assert!(calm.x >= 49.0, "a calm deer lets a person that far be");
    }
}
