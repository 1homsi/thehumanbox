//! Carcasses: where a wolf or a bear makes a kill, the prey lies for a while
//! and birds gather over it. A bird that can see a carcass turns to fly to it,
//! picks at it while it is there, and the carcass rots away or is picked clean.

use super::flocks::HEADINGS;
use super::*;
use crate::organism::animal::AnimalKind;

/// How far (Manhattan tiles) a bird notices a carcass.
pub(super) const SCAVENGE_RANGE: f32 = 20.0;
/// How close (Manhattan tiles) a bird must be to feed on a carcass.
pub(super) const FEED_RANGE: f32 = 1.5;
/// Ticks a carcass lies before it has rotted away.
pub(super) const CARCASS_TICKS: u32 = 360;
/// Bird-ticks spent on a carcass that pick it clean.
pub(super) const PICKED_CLEAN: u32 = 40;
/// Chance a bird that sees a carcass turns toward it this tick.
const SCAVENGE_CHANCE: f32 = 0.35;

/// The remains of prey a predator killed.
#[derive(Clone)]
pub struct Carcass {
    pub x: f32,
    pub y: f32,
    /// The kind of the prey.
    pub kind: AnimalKind,
    /// Ticks since the kill.
    pub age: u32,
    /// Bird-ticks spent feeding on it so far.
    pub picked: u32,
}

impl Simulation {
    /// Ages the carcasses, counts the birds feeding on them, turns the birds
    /// that can see one toward the nearest, and clears the ones that have rotted
    /// or been picked clean. Runs after the flocks, so a flock still wheels as one
    /// except for the birds that have seen a meal.
    pub(super) fn tick_scavengers(&mut self) {
        if self.carcasses.is_empty() {
            return;
        }
        for c in &mut self.carcasses {
            c.age += 1;
        }
        let birds: Vec<usize> = (0..self.animals.len())
            .filter(|&i| {
                let a = &self.animals[i];
                a.alive && a.kind == AnimalKind::Bird && !a.sleeping && !a.away
            })
            .collect();
        for c in self.carcasses.iter_mut() {
            let feeding = birds
                .iter()
                .filter(|&&bi| {
                    let a = &self.animals[bi];
                    (a.x - c.x).abs() + (a.y - c.y).abs() <= FEED_RANGE
                })
                .count();
            c.picked += feeding as u32;
        }
        for &bi in &birds {
            let (x, y) = (self.animals[bi].x, self.animals[bi].y);
            let mut nearest: Option<(f32, f32, f32)> = None;
            for c in &self.carcasses {
                let d = (c.x - x).abs() + (c.y - y).abs();
                if d <= SCAVENGE_RANGE && nearest.is_none_or(|n| d < n.0) {
                    nearest = Some((d, c.x, c.y));
                }
            }
            let Some((d, cx, cy)) = nearest else {
                continue;
            };
            if d <= FEED_RANGE || self.rng.random::<f32>() >= SCAVENGE_CHANCE {
                continue;
            }
            let dx = if cx - x > 0.5 {
                1
            } else if cx - x < -0.5 {
                -1
            } else {
                0
            };
            let dy = if cy - y > 0.5 {
                1
            } else if cy - y < -0.5 {
                -1
            } else {
                0
            };
            if let Some(h) = HEADINGS.iter().position(|&step| step == (dx, dy)) {
                self.animals[bi].heading = h as u8;
            }
        }
        self.carcasses
            .retain(|c| c.age < CARCASS_TICKS && c.picked < PICKED_CLEAN);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lone_bird(sim: &mut Simulation, x: f32, y: f32) -> usize {
        sim.animals.clear();
        let mut bird = Animal::new(0, x, y, AnimalKind::Bird);
        bird.heading = 0;
        sim.animals.push(bird);
        0
    }

    #[test]
    fn a_bird_that_sees_a_carcass_turns_toward_it() {
        let mut sim = Simulation::new(42);
        let bi = lone_bird(&mut sim, 50.0, 50.0);
        sim.carcasses.push(Carcass {
            x: 56.0,
            y: 50.0,
            kind: AnimalKind::Deer,
            age: 0,
            picked: 0,
        });
        let east = HEADINGS.iter().position(|&h| h == (1, 0)).unwrap() as u8;
        let mut turned = false;
        for _ in 0..40 {
            sim.tick_scavengers();
            if sim.animals[bi].heading == east {
                turned = true;
                break;
            }
        }
        assert!(turned, "a bird six tiles away turns east toward the carcass");
    }

    #[test]
    fn a_bird_on_a_carcass_picks_at_it_and_it_is_picked_clean() {
        let mut sim = Simulation::new(42);
        lone_bird(&mut sim, 50.0, 50.0);
        sim.carcasses.push(Carcass {
            x: 50.0,
            y: 50.5,
            kind: AnimalKind::Rabbit,
            age: 0,
            picked: 0,
        });
        for _ in 0..PICKED_CLEAN {
            sim.tick_scavengers();
        }
        assert!(sim.carcasses.is_empty(), "forty bird-ticks pick a carcass clean");
    }

    #[test]
    fn a_bird_on_open_ground_flies_to_a_carcass_and_feeds() {
        let mut sim = Simulation::new(42);
        sim.organisms.clear();
        sim.animals.clear();
        for y in 40..=60 {
            for x in 40..=70 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.animals.push(Animal::new(0, 50.0, 50.0, AnimalKind::Bird));
        sim.carcasses.push(Carcass {
            x: 56.0,
            y: 50.0,
            kind: AnimalKind::Deer,
            age: 0,
            picked: 0,
        });
        let mut fed = false;
        for _ in 0..80 {
            sim.tick_animals(&rustc_hash::FxHashMap::default());
            if sim.carcasses.first().is_none_or(|c| c.picked > 0) {
                fed = true;
                break;
            }
        }
        assert!(
            fed,
            "a bird six tiles away reaches the carcass within 80 ticks and picks at it"
        );
    }

    #[test]
    fn a_carcass_rots_away_after_its_time() {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        sim.carcasses.push(Carcass {
            x: 10.0,
            y: 10.0,
            kind: AnimalKind::Deer,
            age: 0,
            picked: 0,
        });
        for _ in 0..CARCASS_TICKS - 1 {
            sim.tick_scavengers();
        }
        assert_eq!(sim.carcasses.len(), 1);
        sim.tick_scavengers();
        assert!(sim.carcasses.is_empty());
    }

    /// Runs one tick of the animals with hungry wolves at `wolves` and a deer three tiles east of (50, 50);
    /// returns the carcasses left.
    fn one_hunt(wolves: &[(f32, f32)]) -> usize {
        let mut sim = Simulation::new(42);
        sim.organisms.clear();
        sim.animals.clear();
        for &(x, y) in wolves {
            let mut wolf = Animal::new(sim.animals.len(), x, y, AnimalKind::Wolf);
            wolf.energy = 0.3;
            sim.animals.push(wolf);
        }
        let deer = Animal::new(sim.animals.len(), 53.0, 50.0, AnimalKind::Deer);
        sim.animals.push(deer);
        sim.tick_animals(&rustc_hash::FxHashMap::default());
        sim.carcasses.len()
    }

    #[test]
    fn a_pack_of_wolves_runs_prey_down_from_further_off_than_a_lone_wolf() {
        assert_eq!(
            one_hunt(&[(50.0, 50.0)]),
            0,
            "a lone wolf does not reach a deer three tiles off"
        );
        assert_eq!(
            one_hunt(&[(50.0, 50.0), (50.0, 52.0)]),
            1,
            "two wolves together reach it and leave a carcass where it fell"
        );
    }

    #[test]
    fn a_carcass_survives_a_save_and_load_with_its_kind_and_age() {
        let mut sim = Simulation::new(42);
        sim.carcasses.push(Carcass {
            x: 12.5,
            y: 30.0,
            kind: AnimalKind::Sheep,
            age: 17,
            picked: 3,
        });
        let saved = serde_json::to_string(&sim.to_save_state()).unwrap();
        let back = Simulation::from_save(42, serde_json::from_str(&saved).unwrap());
        assert_eq!(back.carcasses.len(), 1);
        let c = &back.carcasses[0];
        assert_eq!((c.x, c.y, c.age, c.picked), (12.5, 30.0, 17, 3));
        assert_eq!(c.kind.name(), "sheep");
    }
}
