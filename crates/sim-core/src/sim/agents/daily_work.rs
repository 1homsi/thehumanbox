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
/// Children this close to a parent setting out to work go along to learn.
const APPRENTICE_REACH: i32 = 10;
/// At most this many children follow one parent to work.
const MAX_APPRENTICES: usize = 2;
/// Empty tries in a row before a worker gives up on a spot and moves along.
const MISSES_BEFORE_MOVING: u8 = 6;
/// How far someone walks back to a place their work went well, beyond `WORK_REACH`.
const REMEMBERED_REACH: i32 = WORK_REACH + 8;
/// How far a skilled worker's call reaches the tribe's young who are still
/// finding their trade.
const MASTER_REACH: i32 = 16;
/// A youngster drawn to a kind of work at least this much will go and learn it
/// from a skilled stranger of their tribe.
const DRAWN_TO: f32 = 0.6;
/// A tribe holding less than this much grain per person is short of food.
const LEAN_STORES_PER_HEAD: u32 = 2;

/// The kinds of everyday work, with the skill each one practises.
const WORK: [Skill; 6] = [
    Skill::Farming,
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
    /// For field work: the field is ripe and is being brought in, rather than tended.
    pub harvest: bool,
    /// Tries in a row at this spot that came to nothing.
    pub misses: u8,
}

impl WorkPlan {
    /// The action to do at the spot and the thought that goes with it.
    pub fn action(&self) -> (usize, &'static str) {
        match self.skill {
            Skill::Fishing => (28, "fishing"),
            Skill::Woodcutting => (27, "felling trees"),
            Skill::Quarrying => (29, "quarrying stone"),
            Skill::Hunting => (121, "stalking game"),
            Skill::Farming if self.harvest => (35, "harvesting the field"),
            Skill::Farming => (338, "tending crops"),
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
            Skill::Farming => "going out to the fields",
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

/// Whether someone already carries a full load of what `skill` gathers.
fn hands_full(o: &crate::organism::organism::Organism, skill: Skill) -> bool {
    match skill {
        Skill::Woodcutting => o.inv_wood >= WOOD_LOAD,
        Skill::Quarrying => o.inv_stone >= STONE_LOAD,
        // A field's crop goes to the tribe's stores, not into their hands.
        Skill::Farming => false,
        _ => o.inv_food >= FOOD_LOAD,
    }
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
    /// The tribe's nearest field that wants work: a ripe one first (with
    /// `true`), else a growing one to tend.
    fn field_to_work(&self, lineage: &str, from: (i32, i32)) -> Option<((i32, i32), bool)> {
        let tick = self.tick_count;
        self.farms
            .iter()
            .filter(|f| f.owner_lineage == lineage && !f.harvested && !f.withered)
            .map(|f| ((f.x, f.y), f.is_mature(tick)))
            .filter(|&(p, _)| manhattan(p, from) <= WORK_REACH)
            .min_by_key(|&(p, ripe)| (!ripe, manhattan(p, from), p))
    }

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
            // A ripe field waits for nobody; a growing one can use the hands.
            Skill::Farming => match self.field_to_work(&o.lineage_id, (o.x as i32, o.y as i32)) {
                Some((_, true)) => 0.5,
                Some((_, false)) => 0.1,
                None => -1.0,
            },
            _ => 0.0,
        };
        // The tribe's own craft pulls a little: it is what everyone around them does.
        let tradition = if self.tribe_craft(&o.lineage_id) == Some(skill) {
            0.1
        } else {
            0.0
        };
        // A place they know works makes the work easier to choose.
        let known_place = o.skills.good_spot(skill).map_or(0.0, |(_, sure)| sure * 0.2);
        o.skills.level(skill)
            + 0.25 * liking(&o.id, skill)
            + o.skills.feeling(skill)
            + need
            + tradition
            + known_place
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
        let on_schedule = tick % 60 == (idx as u64 + 30) % 60;
        // A field can ripen between check-ins; someone working it notices at
        // once instead of standing over a ripe crop until the next one.
        let in_the_fields = self.organisms[idx]
            .work
            .is_some_and(|plan| plan.skill == Skill::Farming);
        if !on_schedule && !in_the_fields {
            return;
        }
        self.tend_daily_work(idx);
        if !on_schedule {
            return;
        }
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
        // A tribe that remembers a hungry winter gathers food all autumn.
        let laying_by = self.season() == "decline"
            && self.winter_memory(&lineage) >= crate::sim::civ::society::hard_winters::REMEMBERED;
        let food_short = village_stores::stock_of(self, &lineage) < members * LEAN_STORES_PER_HEAD
            || self.organisms[idx].energy < 0.75
            || laying_by;
        let mut ranked: Vec<(Skill, f32)> = WORK
            .into_iter()
            .map(|s| (s, self.work_score(idx, s, food_short)))
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        for (skill, _) in ranked {
            // Nothing to go out for with hands already full of it.
            if hands_full(&self.organisms[idx], skill) {
                continue;
            }
            // Work they still dread is not on the list at all.
            if self.organisms[idx].skills.feeling(skill) <= crate::organism::skills::DREAD / 2.0 {
                continue;
            }
            // A place this work went well before comes first, if it still serves.
            let remembered = self.organisms[idx]
                .skills
                .good_spot(skill)
                .map(|(p, _)| p)
                .filter(|&p| {
                    skill != Skill::Farming
                        && manhattan(p, here) <= REMEMBERED_REACH
                        && self.spot_still_good(skill, p)
                });
            let (spot, harvest) = if skill == Skill::Farming {
                let lineage = self.organisms[idx].lineage_id.clone();
                match self.field_to_work(&lineage, here) {
                    Some(field) => field,
                    None => continue,
                }
            } else {
                match remembered.or_else(|| self.work_spot(skill, here)) {
                    Some(spot) => (spot, false),
                    None => continue,
                }
            };
            if self.organisms[idx].route.borrow().recently_blocked(spot) {
                continue;
            }
            self.organisms[idx].work = Some(WorkPlan {
                skill,
                spot,
                until: tick + STINT,
                harvest,
                misses: 0,
            });
            self.take_apprentices(idx, skill, spot);
            if remembered.is_some() {
                let thought = format!("going back to my {} spot", skill.name());
                self.organisms[idx].think(&thought, tick);
            } else {
                let thought = self.organisms[idx]
                    .work
                    .map(|p| p.walking_thought())
                    .unwrap_or("");
                self.organisms[idx].think(thought, tick);
            }
            return;
        }
    }

    /// A parent setting out to work takes their free children along to watch
    /// and learn (`agents::skills` teaches watchers, twice as fast from a parent).
    fn take_apprentices(&mut self, idx: usize, skill: Skill, spot: (i32, i32)) {
        let tick = self.tick_count;
        let parent_id = self.organisms[idx].id.clone();
        let parent_name = self.organisms[idx].name.clone();
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let free = |o: &crate::organism::organism::Organism| {
            o.alive
                && o.work.is_none()
                && o.journey.is_none()
                && o.wander_target.is_none()
                && o.energy > 0.5
                && o.hydration > 0.5
        };
        // Their own children first, then (for a skilled worker) the tribe's
        // young who have no one at home to learn the work from, if the work
        // draws them: skills spread beyond the families that have them.
        let mut candidates: Vec<(usize, bool)> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| {
                free(o)
                    && (o.parent_id == parent_id || o.father_id.as_deref() == Some(parent_id.as_str()))
                    && matches!(o.age_stage(), AgeStage::Child | AgeStage::Teen)
                    && manhattan((o.x as i32, o.y as i32), here) <= APPRENTICE_REACH
            })
            .map(|(i, _)| (i, true))
            .collect();
        let worker_level = self.organisms[idx].skills.level(skill);
        if worker_level >= crate::organism::skills::SKILLED {
            let lineage = self.organisms[idx].lineage_id.clone();
            let youngsters: Vec<usize> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|&(i, o)| {
                    i != idx
                        && free(o)
                        && o.lineage_id == lineage
                        && o.age_stage() == AgeStage::Teen
                        && !candidates.iter().any(|&(c, _)| c == i)
                        && o.skills.level(skill) + 0.2 < worker_level
                        && liking(&o.id, skill) >= DRAWN_TO
                        && manhattan((o.x as i32, o.y as i32), here) <= MASTER_REACH
                })
                .map(|(i, _)| i)
                .filter(|&i| !self.has_skilled_parent(i, skill))
                .collect();
            candidates.extend(youngsters.into_iter().map(|y| (y, false)));
        }
        // A slot goes only to someone who can get to the work.
        let mut placed = 0;
        for (child, own) in candidates {
            if placed == MAX_APPRENTICES {
                break;
            }
            // They stand a step or two off the work, where they can see it.
            let beside = (spot.0 + 1 - placed as i32 * 2, spot.1 + 1);
            let target = if self.workable_ground(beside.0, beside.1) {
                beside
            } else {
                spot
            };
            // A shore is fine to stand on to watch, though not a place to wander to.
            if !self.workable_ground(target.0, target.1)
                || self.organisms[child].route.borrow().recently_blocked(target)
            {
                continue;
            }
            placed += 1;
            self.organisms[child].wander_target = Some(target);
            let thought = format!("following {} to learn {}", parent_name, skill.name());
            self.organisms[child].think(&thought, tick);
            // Going to learn a kind of work from someone not their own is a turn
            // in a youngster's life, told once for each kind of work.
            let told = format!("a skilled {}", skill.worker());
            let already = self.organisms[child]
                .life_log
                .iter()
                .any(|e| e.text.starts_with("went to learn from") && e.text.ends_with(&told));
            if !own && !already {
                self.organisms[child].log_life_rel(
                    tick,
                    "learned",
                    format!("went to learn from {}, {}", parent_name, told),
                    Some(parent_id.clone()),
                    Some(parent_name.clone()),
                );
            }
        }
    }

    /// Whether `spot` can still be worked for `skill`: the water, rock, tree or
    /// berries are still there. Game moves, so no hunting spot is kept.
    fn spot_still_good(&self, skill: Skill, spot: (i32, i32)) -> bool {
        let beside = |kind: Tile, reach: i32| {
            (-reach..=reach)
                .any(|dx| (-reach..=reach).any(|dy| self.grid.get(spot.0 + dx, spot.1 + dy) == kind))
        };
        match skill {
            Skill::Fishing => self.workable_ground(spot.0, spot.1) && beside(Tile::Water, 1),
            Skill::Quarrying => self.workable_ground(spot.0, spot.1) && beside(Tile::Rock, 1),
            Skill::Woodcutting => self.grid.get(spot.0, spot.1) == Tile::Grass,
            Skill::Foraging => beside(Tile::Food, 2),
            _ => false,
        }
    }

    /// Another place to do `skill`, near `from` but at least `gap` tiles from `avoid`.
    fn spot_further_along(
        &self,
        skill: Skill,
        from: (i32, i32),
        avoid: (i32, i32),
        gap: i32,
    ) -> Option<(i32, i32)> {
        const REACH: i32 = 10;
        let mut best: Option<((i32, i32), i32)> = None;
        for dy in -REACH..=REACH {
            for dx in -REACH..=REACH {
                let p = (from.0 + dx, from.1 + dy);
                let d = dx.abs() + dy.abs();
                if d > REACH || manhattan(p, avoid) < gap || best.is_some_and(|(_, bd)| d >= bd) {
                    continue;
                }
                if self.spot_still_good(skill, p) {
                    best = Some((p, d));
                }
            }
        }
        best.map(|(p, _)| p)
    }

    /// Learns from one try at the day's work: the place is remembered or worn
    /// out, and a worker whose spot keeps coming up empty moves along.
    pub(crate) fn note_work_outcome(&mut self, idx: usize, skill: Skill, succeeded: bool) {
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let Some(mut plan) = self.organisms[idx]
            .work
            .filter(|p| p.skill == skill && p.at_spot(here))
        else {
            return;
        };
        if skill != Skill::Hunting {
            self.organisms[idx].skills.note_spot(skill, plan.spot, succeeded);
        }
        plan.misses = if succeeded {
            0
        } else {
            plan.misses.saturating_add(1)
        };
        if plan.misses >= MISSES_BEFORE_MOVING {
            let tick = self.tick_count;
            self.organisms[idx].skills.forget_spot_at(skill, plan.spot);
            match self.spot_further_along(skill, plan.spot, plan.spot, 4) {
                Some(next) => {
                    plan.spot = next;
                    plan.misses = 0;
                    self.organisms[idx].think("nothing here; trying further along", tick);
                }
                None => {
                    self.organisms[idx].work = None;
                    self.organisms[idx].think("nothing to be had here today", tick);
                    return;
                }
            }
        }
        self.organisms[idx].work = Some(plan);
    }

    /// Whether a living parent of `idx` is at least handy at `skill`, so the
    /// youngster can learn it at home.
    fn has_skilled_parent(&self, idx: usize, skill: Skill) -> bool {
        let o = &self.organisms[idx];
        self.organisms.iter().any(|p| {
            p.alive
                && (p.id == o.parent_id || o.father_id.as_deref() == Some(p.id.as_str()))
                && p.skills.level(skill) >= crate::organism::skills::HANDY
        })
    }

    /// Ends a stint that is over, full-handed, or out of work, and keeps the
    /// spot on something that can still be worked.
    fn tend_daily_work(&mut self, idx: usize) {
        let tick = self.tick_count;
        let Some(plan) = self.organisms[idx].work else {
            return;
        };
        let o = &self.organisms[idx];
        let full = hands_full(o, plan.skill);
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
        // Field work follows the field: a tended field that ripened is brought in,
        // and one brought in sends the worker to the next field or home.
        if plan.skill == Skill::Farming {
            let lineage = self.organisms[idx].lineage_id.clone();
            let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            self.organisms[idx].work = self
                .field_to_work(&lineage, here)
                .map(|(spot, harvest)| WorkPlan {
                    spot,
                    harvest,
                    ..plan
                });
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
            harvest: false,
            misses: 0,
        });
        sim.organisms[0].inv_food = FOOD_LOAD;
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert!(sim.organisms[0].work.is_none());
        assert_eq!(sim.organisms[0].wander_target, Some((100, 100)));
    }

    #[test]
    fn nobody_goes_out_for_what_their_hands_are_already_full_of() {
        let mut sim = shore();
        sim.organisms[0].skills.set(Skill::Fishing, 0.9);
        sim.organisms[0].inv_food = FOOD_LOAD;
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert!(
            sim.organisms[0]
                .work
                .is_none_or(|p| !matches!(p.skill, Skill::Fishing | Skill::Foraging | Skill::Hunting)),
            "went out for food with full hands"
        );
    }

    #[test]
    fn hurt_at_work_they_swear_off_it_and_choose_other_work() {
        use crate::organism::organism::Harm;
        let mut sim = shore();
        sim.organisms[0].skills.set(Skill::Fishing, 0.7);
        sim.organisms[0].work = Some(WorkPlan {
            skill: Skill::Fishing,
            spot: (109, 100),
            until: u64::MAX,
            harvest: false,
            misses: 0,
        });
        sim.organisms[0].mark_harm(Harm::Drowning, 50);
        assert!(
            sim.organisms[0].work.is_none(),
            "kept working after nearly drowning"
        );
        assert!(sim.organisms[0].skills.feeling(Skill::Fishing) <= crate::organism::skills::DREAD);
        assert!(sim.organisms[0]
            .life_log
            .iter()
            .any(|e| e.text == "swore off fishing after nearly drowning"));
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert!(
            sim.organisms[0].work.is_none_or(|p| p.skill != Skill::Fishing),
            "went fishing again the next morning"
        );
    }

    fn teen_of(sim: &Simulation, id: &str, parent: &str) -> crate::organism::organism::Organism {
        let mut teen = crate::organism::organism::Organism::new(
            id.into(),
            "Teen".into(),
            102.0,
            101.0,
            1,
            parent.into(),
            sim.organisms[0].lineage_id.clone(),
            4000,
            Default::default(),
        );
        teen.age = 1200;
        teen.energy = 0.9;
        teen.hydration = 0.9;
        teen
    }

    #[test]
    fn a_skilled_fisher_takes_on_a_teen_of_the_tribe_drawn_to_the_work() {
        let mut sim = shore();
        let keen = (0..200)
            .map(|n| format!("teen{n}"))
            .find(|id| liking(id, Skill::Fishing) >= DRAWN_TO)
            .expect("some id likes fishing");
        let cool = (0..200)
            .map(|n| format!("teen{n}"))
            .find(|id| liking(id, Skill::Fishing) < 0.3)
            .expect("some id does not");
        let (keen_teen, cool_teen) = (
            teen_of(&sim, &keen, "elsewhere"),
            teen_of(&sim, &cool, "elsewhere"),
        );
        sim.organisms.push(keen_teen);
        sim.organisms.push(cool_teen);
        assert_eq!(sim.organisms[1].age_stage(), AgeStage::Teen);
        sim.organisms[0].skills.set(Skill::Fishing, 0.8);
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert!(sim.organisms[0].work.is_some_and(|p| p.skill == Skill::Fishing));
        assert!(sim.organisms[1].thought.ends_with("to learn fishing"));
        assert!(sim.organisms[1]
            .life_log
            .iter()
            .any(|e| e.text.starts_with("went to learn from") && e.text.ends_with("a skilled fisher")));
        assert!(
            sim.organisms[2].wander_target.is_none(),
            "a teen not drawn to it stayed"
        );

        // Another day at it, having learned nothing yet: the line is not told twice.
        sim.organisms[1].wander_target = None;
        sim.organisms[0].work = None;
        sim.tick_count = morning(0) + DAY_LENGTH;
        sim.assign_daily_work(0);
        let told = sim.organisms[1]
            .life_log
            .iter()
            .filter(|e| e.text.starts_with("went to learn from"))
            .count();
        assert_eq!(told, 1);
    }

    #[test]
    fn a_teen_with_a_handy_parent_learns_at_home_not_from_a_stranger() {
        let mut sim = shore();
        let keen = (0..200)
            .map(|n| format!("teen{n}"))
            .find(|id| liking(id, Skill::Fishing) >= DRAWN_TO)
            .expect("some id likes fishing");
        let mut parent = teen_of(&sim, "parent", "grandparent");
        parent.age = 3000;
        parent.x = 60.0;
        parent.skills.set(Skill::Fishing, 0.5);
        sim.organisms.push(parent);
        let teen = teen_of(&sim, &keen, "parent");
        sim.organisms.push(teen);
        sim.organisms[0].skills.set(Skill::Fishing, 0.8);
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert!(sim.organisms[2].wander_target.is_none());
    }

    #[test]
    fn a_parent_going_fishing_takes_the_children_along_to_learn() {
        let mut sim = shore();
        let mut child = crate::organism::organism::Organism::new(
            "kid".into(),
            "Kid".into(),
            101.0,
            100.0,
            1,
            sim.organisms[0].id.clone(),
            sim.organisms[0].lineage_id.clone(),
            4000,
            Default::default(),
        );
        child.age = 900;
        child.energy = 0.9;
        child.hydration = 0.9;
        sim.organisms.push(child);
        assert_eq!(sim.organisms[1].age_stage(), AgeStage::Child);
        sim.organisms[0].skills.set(Skill::Fishing, 0.7);
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert!(sim.organisms[0].work.is_some());
        let target = sim.organisms[1].wander_target.expect("the child came along");
        assert!(manhattan(target, (109, 100)) <= 2, "{target:?}");
        assert!(sim.organisms[1].thought.starts_with("following"));
        assert!(sim.organisms[1].thought.ends_with("to learn fishing"));
    }

    #[test]
    fn a_ripe_field_calls_someone_out_to_bring_it_in() {
        use crate::sim::tech::agriculture::{CropKind, Farm};
        let mut sim = shore();
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.tick_count = morning(0);
        sim.farms.push(Farm {
            id: 1,
            x: 96,
            y: 100,
            owner_lineage: lineage,
            crop: CropKind::Wheat,
            planted_tick: 0,
            ready_tick: 1,
            harvested: false,
            prepared: true,
            season_timed: false,
            withered: false,
        });
        sim.assign_daily_work(0);
        let plan = sim.organisms[0].work.expect("set out to work");
        assert_eq!(plan.skill, Skill::Farming);
        assert!(plan.harvest);
        assert_eq!(plan.spot, (96, 100));
        assert_eq!(plan.action(), (35, "harvesting the field"));
    }

    #[test]
    fn a_field_that_ripens_while_tended_is_brought_in_straight_away() {
        use crate::sim::tech::agriculture::{CropKind, Farm};
        let mut sim = shore();
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.tick_count = morning(0);
        sim.farms.push(Farm {
            id: 1,
            x: 96,
            y: 100,
            owner_lineage: lineage,
            crop: CropKind::Wheat,
            planted_tick: 0,
            ready_tick: sim.tick_count + 5,
            harvested: false,
            prepared: true,
            season_timed: false,
            withered: false,
        });
        sim.organisms[0].skills.set(Skill::Farming, 0.8);
        sim.assign_daily_work(0);
        let plan = sim.organisms[0].work.expect("out tending the field");
        assert_eq!(plan.skill, Skill::Farming);
        assert!(!plan.harvest);
        // Off the hourly check-in, a few ticks after it ripened.
        sim.tick_count += 7;
        sim.assign_daily_work(0);
        assert!(sim.organisms[0].work.is_some_and(|p| p.harvest));
    }

    #[test]
    fn food_in_hand_does_not_keep_a_farmer_from_a_ripe_field() {
        use crate::sim::tech::agriculture::{CropKind, Farm};
        let mut sim = shore();
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.organisms[0].inv_food = 255;
        sim.organisms[0].skills.set(Skill::Farming, 0.8);
        sim.tick_count = morning(0);
        sim.farms.push(Farm {
            id: 1,
            x: 96,
            y: 100,
            owner_lineage: lineage,
            crop: CropKind::Wheat,
            planted_tick: 0,
            ready_tick: 1,
            harvested: false,
            prepared: true,
            season_timed: false,
            withered: false,
        });
        sim.assign_daily_work(0);
        let plan = sim.organisms[0].work.expect("set out to work");
        assert_eq!(plan.skill, Skill::Farming);
        assert!(plan.harvest);
    }

    #[test]
    fn a_spot_that_stops_giving_is_forgotten_however_sure_they_were() {
        let mut sim = shore();
        sim.organisms[0].x = 109.0;
        for _ in 0..10 {
            sim.organisms[0]
                .skills
                .note_spot(Skill::Fishing, (109, 100), true);
        }
        assert!(sim.organisms[0]
            .skills
            .good_spot(Skill::Fishing)
            .is_some_and(|(_, sure)| sure > 0.8));
        sim.organisms[0].work = Some(WorkPlan {
            skill: Skill::Fishing,
            spot: (109, 100),
            until: u64::MAX,
            harvest: false,
            misses: 0,
        });
        for _ in 0..MISSES_BEFORE_MOVING {
            sim.note_work_outcome(0, Skill::Fishing, false);
        }
        assert_eq!(sim.organisms[0].skills.good_spot(Skill::Fishing), None);
    }

    #[test]
    fn empty_tries_move_a_fisher_along_the_shore_and_a_good_catch_is_remembered() {
        let mut sim = shore();
        sim.organisms[0].x = 109.0;
        sim.organisms[0].work = Some(WorkPlan {
            skill: Skill::Fishing,
            spot: (109, 100),
            until: u64::MAX,
            harvest: false,
            misses: 0,
        });
        for _ in 0..MISSES_BEFORE_MOVING {
            sim.note_work_outcome(0, Skill::Fishing, false);
        }
        let plan = sim.organisms[0].work.expect("still fishing, elsewhere");
        assert!(
            manhattan(plan.spot, (109, 100)) >= 4,
            "moved along to {:?}",
            plan.spot
        );
        assert_eq!(sim.organisms[0].thought, "nothing here; trying further along");
        // A catch at the new place is remembered, and next morning they go back.
        sim.organisms[0].x = plan.spot.0 as f32;
        sim.organisms[0].y = plan.spot.1 as f32;
        for _ in 0..3 {
            sim.note_work_outcome(0, Skill::Fishing, true);
        }
        assert_eq!(
            sim.organisms[0].skills.good_spot(Skill::Fishing).map(|(p, _)| p),
            Some(plan.spot)
        );
        sim.organisms[0].work = None;
        sim.organisms[0].x = 100.0;
        sim.organisms[0].y = 100.0;
        sim.organisms[0].skills.set(Skill::Fishing, 0.8);
        sim.tick_count = morning(0);
        sim.assign_daily_work(0);
        assert_eq!(sim.organisms[0].work.map(|p| p.spot), Some(plan.spot));
        assert_eq!(sim.organisms[0].thought, "going back to my fishing spot");
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
