//! Everyday work for people with no workshop to go to. Through the working
//! hours a fed, rested teen or adult goes out to do the work they are best at,
//! or what they and their tribe are short of: fishing from the shore, felling
//! trees, quarrying, picking berries, hunting. They walk to the place, keep at
//! it for part of the day, and come home when their hands are full or the day
//! is done.
//!
//! What someone is good at decides much of what they choose, and choosing it
//! makes them better at it, so families and tribes settle into trades of their
//! own: the coast fishes, the forest edge cuts wood. A small lifelong liking
//! for each kind of work (from the person's id) breaks ties among novices.
//!
//! Each person looks once a minute, at their own minute of the hour, like the
//! working day of the trades (`working_day`).

use super::age_stage::AgeStage;
use crate::organism::animal::AnimalKind;
use crate::organism::skills::Skill;
use crate::sim::civ::land::village_stores;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::world::tiles::Tile;

/// People set out to work between these fractions of the day.
const WORK_HOURS: (f32, f32) = (0.08, 0.60);
/// How long one stint of work lasts, in ticks (a fifth of a day).
const STINT: u64 = DAY_LENGTH / 5;
/// Farthest place (tiles, Manhattan) someone walks to for a day's work.
const WORK_REACH: i32 = 18;
/// Wood and stone someone carries home before stopping.
const WOOD_LOAD: u8 = 3;
const STONE_LOAD: u8 = 4;
/// Food someone gathers before taking it home.
const FOOD_LOAD: u8 = 3;
/// A tribe holding less than this much grain per person is short of food.
const LEAN_STORES_PER_HEAD: u32 = 2;

/// The kinds of everyday work, with the skill each one practises.
const WORK: [Skill; 5] = [
    Skill::Fishing,
    Skill::Woodcutting,
    Skill::Quarrying,
    Skill::Foraging,
    Skill::Hunting,
];

/// A stint of work: what, where, and until when. Runtime only.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorkPlan {
    pub skill: Skill,
    /// The tile to work from (beside the water, the rock face, the trees...).
    pub spot: (i32, i32),
    pub until: u64,
}

impl WorkPlan {
    /// The action to do at the spot and the thought that goes with it.
    pub fn action(&self) -> (usize, &'static str) {
        match self.skill {
            Skill::Fishing => (28, "fishing"),
            Skill::Woodcutting => (27, "felling trees"),
            Skill::Quarrying => (29, "quarrying stone"),
            Skill::Hunting => (121, "stalking game"),
            _ => (34, "picking berries"),
        }
    }

    /// The thought while walking out to the spot.
    pub fn walking_thought(&self) -> &'static str {
        match self.skill {
            Skill::Fishing => "going fishing",
            Skill::Woodcutting => "going to cut wood",
            Skill::Quarrying => "going to the rock face",
            Skill::Hunting => "going hunting",
            _ => "going foraging",
        }
    }

    /// Close enough to the spot to work there. Felling and quarrying need the
    /// spot itself (on the tree, beside the rock); a shore or berry patch is
    /// workable from a step away, and game from a short stalk.
    pub fn at_spot(&self, here: (i32, i32)) -> bool {
        let reach = match self.skill {
            Skill::Hunting => 3,
            Skill::Fishing | Skill::Foraging => 1,
            _ => 0,
        };
        (self.spot.0 - here.0).abs().max((self.spot.1 - here.1).abs()) <= reach
    }
}

/// A stable liking for each kind of work, 0 to 1, from the person's id.
pub fn liking(id: &str, skill: Skill) -> f32 {
    let mut h: u32 = 2_166_136_261;
    for b in id.bytes().chain(std::iter::once(skill as u8)) {
        h ^= b as u32;
        h = h.wrapping_mul(16_777_619);
    }
    (h % 1000) as f32 / 1000.0
}

fn manhattan(a: (i32, i32), b: (i32, i32)) -> i32 {
    (a.0 - b.0).abs() + (a.1 - b.1).abs()
}

impl Simulation {
    /// Ground someone can stand on to work: dry, walkable and not dangerous. A
    /// shore beside deep water is fine to fish from, though not a place to wander to.
    fn workable_ground(&self, x: i32, y: i32) -> bool {
        let t = self.grid.get(x, y);
        t.walkable() && t != Tile::Fire && !self.grid.is_wet(t, x, y) && self.grid.hazard_at(x, y) < 0.45
    }

    /// A dry tile next to `kind` within `reach` of `from`, nearest first.
    fn land_beside(&self, from: (i32, i32), kind: Tile, reach: i32) -> Option<(i32, i32)> {
        let mut best: Option<((i32, i32), i32)> = None;
        for dy in -reach..=reach {
            for dx in -reach..=reach {
                let p = (from.0 + dx, from.1 + dy);
                let d = dx.abs() + dy.abs();
                if d > reach || best.is_some_and(|(_, bd)| d >= bd) {
                    continue;
                }
                if self.grid.get(p.0, p.1) != kind {
                    continue;
                }
                let dry = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                    .into_iter()
                    .map(|(ax, ay)| (p.0 + ax, p.1 + ay))
                    .filter(|&q| self.workable_ground(q.0, q.1))
                    .min_by_key(|&q| manhattan(q, from));
                if let Some(q) = dry {
                    best = Some((q, d));
                }
            }
        }
        best.map(|(q, _)| q)
    }

    /// The nearest tile of `kind` within `reach` of `from`.
    fn nearest_tile(&self, from: (i32, i32), kind: Tile, reach: i32) -> Option<(i32, i32)> {
        let mut best: Option<((i32, i32), i32)> = None;
        for dy in -reach..=reach {
            for dx in -reach..=reach {
                let d = dx.abs() + dy.abs();
                if d > reach || best.is_some_and(|(_, bd)| d >= bd) {
                    continue;
                }
                if self.grid.get(from.0 + dx, from.1 + dy) == kind {
                    best = Some(((from.0 + dx, from.1 + dy), d));
                }
            }
        }
        best.map(|(p, _)| p)
    }

    /// Where `skill` can be worked from near `from`, if anywhere.
    fn work_spot(&self, skill: Skill, from: (i32, i32)) -> Option<(i32, i32)> {
        match skill {
            Skill::Fishing => self.land_beside(from, Tile::Water, WORK_REACH),
            Skill::Quarrying => self.land_beside(from, Tile::Rock, WORK_REACH),
            Skill::Woodcutting => self.nearest_tile(from, Tile::Grass, WORK_REACH),
            Skill::Foraging => self.nearest_tile(from, Tile::Food, WORK_REACH),
            Skill::Hunting => self
                .animals
                .iter()
                .filter(|a| a.alive && a.bonded_org.is_none() && !a.away)
                .filter(|a| {
                    matches!(
                        a.kind,
                        AnimalKind::Rabbit | AnimalKind::Bird | AnimalKind::Boar | AnimalKind::Deer
                    )
                })
                .map(|a| (a.x as i32, a.y as i32))
                .filter(|&p| manhattan(p, from) <= WORK_REACH)
                .min_by_key(|&p| (manhattan(p, from), p)),
            _ => None,
        }
    }

    /// How much `idx` wants to do `skill` today: skill, liking, and need.
    fn work_score(&self, idx: usize, skill: Skill, food_short: bool) -> f32 {
        let o = &self.organisms[idx];
        let need = match skill {
            Skill::Fishing | Skill::Foraging | Skill::Hunting if food_short => 0.3,
            Skill::Quarrying if o.fetch_stone_until > self.tick_count => 0.3,
            Skill::Woodcutting if o.inv_wood == 0 => 0.1,
            _ => 0.0,
        };
        o.skills.level(skill) + 0.25 * liking(&o.id, skill) + need
    }

    /// Whether `idx` is free and fit for a stint of work.
    fn free_to_work(&self, idx: usize) -> bool {
        let o = &self.organisms[idx];
        o.alive
            && o.work.is_none()
            && o.journey.is_none()
            && o.wander_target.is_none()
            && o.mounted_vehicle.is_none()
            && o.fear_level < 0.5
            && o.energy > 0.55
            && o.hydration > 0.55
            && o.health > 0.5
            && o.sleep_debt < 0.4
            && matches!(o.age_stage(), AgeStage::Teen | AgeStage::Adult)
    }

    /// In the working hours, sends a free, fit person without a workshop out to work.
    pub(crate) fn assign_daily_work(&mut self, idx: usize) {
        let tick = self.tick_count;
        if tick % 60 != (idx as u64 + 30) % 60 {
            return;
        }
        self.tend_daily_work(idx);
        let phase = (tick % DAY_LENGTH) as f32 / DAY_LENGTH as f32;
        if !(WORK_HOURS.0..WORK_HOURS.1).contains(&phase) || !self.free_to_work(idx) {
            return;
        }
        let lineage = self.organisms[idx].lineage_id.clone();
        let home = (
            self.organisms[idx].home_x as i32,
            self.organisms[idx].home_y as i32,
        );
        // A tradesperson with a workshop goes there instead (`working_day`).
        if let Some(trade) = self.organisms[idx].specialty.clone() {
            if self.workplace_for(&lineage, &trade, home).is_some() {
                return;
            }
        }
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let members = self
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .count() as u32;
        let food_short = village_stores::stock_of(self, &lineage) < members * LEAN_STORES_PER_HEAD
            || self.organisms[idx].energy < 0.75;
        let mut ranked: Vec<(Skill, f32)> = WORK
            .into_iter()
            .map(|s| (s, self.work_score(idx, s, food_short)))
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        for (skill, _) in ranked {
            let Some(spot) = self.work_spot(skill, here) else {
                continue;
            };
            if self.organisms[idx].route.borrow().recently_blocked(spot) {
                continue;
            }
            self.organisms[idx].work = Some(WorkPlan {
                skill,
                spot,
                until: tick + STINT,
            });
            let thought = self.organisms[idx]
                .work
                .map(|p| p.walking_thought())
                .unwrap_or("");
            self.organisms[idx].think(thought, tick);
            return;
        }
    }

    /// Ends a stint that is over, full-handed, or out of work, and keeps the
    /// spot on something that can still be worked.
    fn tend_daily_work(&mut self, idx: usize) {
        let tick = self.tick_count;
        let Some(plan) = self.organisms[idx].work else {
            return;
        };
        let o = &self.organisms[idx];
        let full = match plan.skill {
            Skill::Woodcutting => o.inv_wood >= WOOD_LOAD,
            Skill::Quarrying => o.inv_stone >= STONE_LOAD,
            _ => o.inv_food >= FOOD_LOAD,
        };
        let spent =
            !o.alive || tick >= plan.until || self.is_night() || o.energy < 0.35 || o.hydration < 0.35;
        if full {
            let home = (o.home_x as i32, o.home_y as i32);
            self.organisms[idx].work = None;
            if self.set_outing_target(idx, home) {
                self.organisms[idx].think("carrying the day's work home", tick);
            }
            return;
        }
        if spent {
            self.organisms[idx].work = None;
            return;
        }
        // The tree was felled or the berries picked: move to the next one close by.
        let used_up = match plan.skill {
            Skill::Woodcutting => self.grid.get(plan.spot.0, plan.spot.1) != Tile::Grass,
            Skill::Foraging => self.nearest_tile(plan.spot, Tile::Food, 2).is_none(),
            Skill::Hunting => true,
            _ => false,
        };
        if used_up {
            let next = match plan.skill {
                Skill::Hunting => self.work_spot(Skill::Hunting, plan.spot),
                Skill::Woodcutting => self.nearest_tile(plan.spot, Tile::Grass, 6),
                _ => self.nearest_tile(plan.spot, Tile::Food, 6),
            };
            self.organisms[idx].work = next.map(|spot| WorkPlan { spot, ..plan });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One working adult on open grass at (100, 100), water to the east from x = 110.
    fn shore() -> Simulation {
        let mut sim = Simulation::new(77);
        sim.organisms.truncate(1);
        sim.animals.clear();
        for x in 80..=125 {
            for y in 80..=120 {
                sim.grid
                    .set(x, y, if x >= 110 { Tile::Water } else { Tile::Sand });
            }
        }
        let o = &mut sim.organisms[0];
        o.alive = true;
        o.x = 100.0;
        o.y = 100.0;
        o.home_x = 100.0;
        o.home_y = 100.0;
        o.age = 2000;
        o.max_age = 4000;
        o.energy = 0.9;
        o.hydration = 0.9;
        o.health = 0.9;
        o.sleep_debt = 0.0;
        o.fear_level = 0.0;
        o.specialty = None;
        o.journey = None;
        o.wander_target = None;
        o.work = None;
        sim
    }

    fn morning(idx: usize) -> u64 {
        let base = 5 * DAY_LENGTH + (DAY_LENGTH as f32 * 0.15) as u64;
        base + ((idx as u64 + 30) % 60 + 60 - base % 60) % 60
    }

    #[test]
    fn a_skilled_fisher_goes_to_the_shore_in_the_morning() {
        let mut sim = shore();
        sim.organisms[0].skills.set(Skill::Fishing, 0.7);
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        let plan = sim.organisms[0].work.expect("set out to work");
        assert_eq!(plan.skill, Skill::Fishing);
        assert_eq!(plan.spot, (109, 100), "the spot is the shore tile nearest home");
        assert_eq!(sim.organisms[0].thought, "going fishing");
    }

    #[test]
    fn nobody_sets_out_at_night_or_while_hungry() {
        let mut sim = shore();
        sim.tick_count = 5 * DAY_LENGTH + (DAY_LENGTH as f32 * 0.8) as u64;
        sim.tick_count += (30 + 60 - sim.tick_count % 60) % 60;
        sim.assign_daily_work(0);
        assert!(sim.organisms[0].work.is_none());
        sim.tick_count = morning(0);
        sim.organisms[0].energy = 0.4;
        sim.assign_daily_work(0);
        assert!(sim.organisms[0].work.is_none());
    }

    #[test]
    fn full_hands_end_the_stint_and_send_them_home() {
        let mut sim = shore();
        sim.organisms[0].x = 109.0;
        sim.organisms[0].work = Some(WorkPlan {
            skill: Skill::Fishing,
            spot: (109, 100),
            until: u64::MAX,
        });
        sim.organisms[0].inv_food = FOOD_LOAD;
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert!(sim.organisms[0].work.is_none());
        assert_eq!(sim.organisms[0].wander_target, Some((100, 100)));
    }

    #[test]
    fn likings_differ_between_people_and_stay_put() {
        assert_eq!(liking("a1", Skill::Fishing), liking("a1", Skill::Fishing));
        let spread: Vec<f32> = ["a1", "b2", "c3", "d4"]
            .iter()
            .map(|id| liking(id, Skill::Fishing))
            .collect();
        assert!(spread.iter().any(|&l| (l - spread[0]).abs() > 0.05));
    }
}
