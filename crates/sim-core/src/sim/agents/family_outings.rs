//! What children and elders do with their idle time.
//!
//! A child keeps close to its mother (or father). When neither is alive it
//! keeps close to the family home. Near that anchor, a child plays with a
//! child of the same lineage who is also close by, so small groups form
//! around the homes. An elder sits beside the campfire at night, and the
//! children who gather there learn a little from them.
//!
//! These are wander targets, the same hint that drives every other walk, so
//! the choice of action still decides how a person moves. Positioning comes
//! first: the learning bonus is small.

use super::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;
use crate::world::tiles::Tile;
use rustc_hash::FxHashMap;

/// A child further than this from its anchor (mother, father or home) is walked back to it.
const KEEP_CLOSE: i32 = 4;
/// Playmates must be this close to the anchor, so play stays near home.
const PLAY_RANGE: i32 = 4;
/// How far an elder will walk to reach a campfire at night.
const FIRE_REACH: i32 = 8;
/// Children this close to an elder who sits by the fire may learn from them.
const LESSON_RANGE: i32 = 3;
/// Literacy a child gains per lesson by the fire. Small on purpose.
const LESSON_LITERACY: f32 = 0.0006;

pub(crate) fn chebyshev(a: (i32, i32), b: (i32, i32)) -> i32 {
    (a.0 - b.0).abs().max((a.1 - b.1).abs())
}

/// A deterministic offset in `-range..=range`, different for each person and tick.
fn spread(idx: usize, tick: u64, salt: u64, range: i32) -> i32 {
    let h = (idx as u64)
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        .wrapping_add(tick.wrapping_mul(31))
        .wrapping_add(salt.wrapping_mul(7919));
    let span = (2 * range + 1) as u64;
    (h % span) as i32 - range
}

impl Simulation {
    /// Gives an idle child or elder somewhere to be. Does nothing for anyone already walking somewhere.
    pub(crate) fn assign_family_outing(
        &mut self,
        idx: usize,
        spatial: &SpatialIndex,
        org_idx_by_id: &FxHashMap<String, usize>,
    ) {
        {
            let o = &self.organisms[idx];
            if !o.alive
                || o.journey.is_some()
                || o.wander_target.is_some()
                || o.energy < 0.35
                || o.hydration < 0.35
                || o.fear_level > 0.5
            {
                return;
            }
        }
        match AgeStage::from_age(self.organisms[idx].age, self.organisms[idx].max_age) {
            AgeStage::Infant => self.keep_with_anchor(idx, spatial, org_idx_by_id, false),
            AgeStage::Child => self.keep_with_anchor(idx, spatial, org_idx_by_id, true),
            AgeStage::Elder if self.is_night() => self.sit_by_the_fire(idx, spatial),
            _ => {}
        }
    }

    /// The living mother, or else the father, if either is alive.
    fn living_guardian(&self, idx: usize, org_idx_by_id: &FxHashMap<String, usize>) -> Option<usize> {
        let o = &self.organisms[idx];
        [Some(o.parent_id.as_str()), o.father_id.as_deref()]
            .into_iter()
            .flatten()
            .filter(|id| !id.is_empty())
            .find_map(|id| {
                org_idx_by_id
                    .get(id)
                    .copied()
                    .filter(|&g| g != idx && self.organisms[g].alive)
            })
    }

    /// Keeps a child (or an infant, which does not play) beside its anchor, and lets a child play with a playmate near it.
    fn keep_with_anchor(
        &mut self,
        idx: usize,
        spatial: &SpatialIndex,
        org_idx_by_id: &FxHashMap<String, usize>,
        may_play: bool,
    ) {
        let tick = self.tick_count;
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let anchor = match self.living_guardian(idx, org_idx_by_id) {
            Some(g) => (self.organisms[g].x as i32, self.organisms[g].y as i32),
            None => (
                self.organisms[idx].home_x as i32,
                self.organisms[idx].home_y as i32,
            ),
        };
        if chebyshev(here, anchor) > KEEP_CLOSE {
            let target = (
                anchor.0 + spread(idx, tick, 1, 1),
                anchor.1 + spread(idx, tick, 2, 1),
            );
            self.set_outing_target(idx, target);
            return;
        }
        if !may_play || tick % 120 != idx as u64 % 120 {
            return;
        }
        let lid = self.organisms[idx].lineage_id.clone();
        let mate = spatial
            .query(anchor.0, anchor.1, PLAY_RANGE + 2)
            .into_iter()
            .filter(|&i| i != idx)
            .filter(|&i| {
                let o = &self.organisms[i];
                o.alive
                    && o.lineage_id == lid
                    && AgeStage::from_age(o.age, o.max_age) == AgeStage::Child
                    && chebyshev((o.x as i32, o.y as i32), anchor) <= PLAY_RANGE
            })
            .min_by_key(|&i| {
                let o = &self.organisms[i];
                ((o.x as i32 - here.0).abs() + (o.y as i32 - here.1).abs(), i)
            });
        if let Some(mate) = mate {
            let target = (self.organisms[mate].x as i32, self.organisms[mate].y as i32);
            if self.set_outing_target(idx, target) {
                self.organisms[idx].think("playing with friends", tick);
            }
        }
    }

    /// An elder with no other business walks to the nearest campfire after dark and sits beside it.
    /// Children who gather there learn a little from them (see `teach_by_the_fire`).
    fn sit_by_the_fire(&mut self, idx: usize, spatial: &SpatialIndex) {
        let tick = self.tick_count;
        if tick % 90 == idx as u64 % 90 {
            let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            if let Some(fire) = self.organisms[idx].nearest_visible(&self.grid, Tile::Campfire, FIRE_REACH) {
                if chebyshev(here, fire) > 1 && self.set_outing_target(idx, fire) {
                    self.organisms[idx].think("sitting by the fire", tick);
                }
            }
        }
        if tick % 30 == idx as u64 % 30 {
            self.teach_by_the_fire(idx, spatial);
        }
    }

    /// Children within reach of an elder who sits by the fire gain a little literacy.
    fn teach_by_the_fire(&mut self, idx: usize, spatial: &SpatialIndex) {
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let at_fire = (-1i32..=1)
            .any(|dx| (-1i32..=1).any(|dy| self.grid.get(here.0 + dx, here.1 + dy) == Tile::Campfire));
        if !at_fire {
            return;
        }
        let lid = self.organisms[idx].lineage_id.clone();
        let pupils: Vec<usize> = spatial
            .query(here.0, here.1, LESSON_RANGE + 1)
            .into_iter()
            .filter(|&i| {
                let o = &self.organisms[i];
                i != idx
                    && o.alive
                    && o.lineage_id == lid
                    && AgeStage::from_age(o.age, o.max_age) == AgeStage::Child
                    && chebyshev((o.x as i32, o.y as i32), here) <= LESSON_RANGE
            })
            .collect();
        for p in pupils {
            let pupil = &mut self.organisms[p];
            pupil.literacy = (pupil.literacy + LESSON_LITERACY).min(1.0);
        }
    }

    /// Sets a walk toward `target` when it is a reachable land tile and the person has not just been blocked on the way.
    pub(crate) fn set_outing_target(&mut self, idx: usize, target: (i32, i32)) -> bool {
        if !self.is_good_land_target(target.0, target.1)
            || self.organisms[idx].route.borrow().recently_blocked(target)
        {
            return false;
        }
        self.organisms[idx].wander_target = Some(target);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::cosmos::DAY_LENGTH;

    /// A small world of grass around (100, 100), with the first four people only,
    /// so no stranger is near the test people.
    fn open_ground() -> Simulation {
        let mut sim = Simulation::new(61);
        sim.organisms.truncate(4);
        for x in 90..=120 {
            for y in 90..=110 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim
    }

    fn place(sim: &mut Simulation, idx: usize, x: f32, y: f32) {
        let o = &mut sim.organisms[idx];
        o.alive = true;
        o.x = x;
        o.y = y;
        o.energy = 0.9;
        o.hydration = 0.9;
        o.fear_level = 0.0;
        o.journey = None;
        o.wander_target = None;
    }

    fn make_child(sim: &mut Simulation, child: usize, mother: usize) {
        let mother_id = sim.organisms[mother].id.clone();
        let lineage = sim.organisms[mother].lineage_id.clone();
        let (hx, hy) = (sim.organisms[mother].x, sim.organisms[mother].y);
        let o = &mut sim.organisms[child];
        o.parent_id = mother_id;
        o.father_id = None;
        o.lineage_id = lineage;
        o.max_age = 4000;
        o.age = 400;
        o.home_x = hx;
        o.home_y = hy;
    }

    fn index_of(sim: &Simulation) -> FxHashMap<String, usize> {
        sim.organisms
            .iter()
            .enumerate()
            .map(|(i, o)| (o.id.clone(), i))
            .collect()
    }

    /// A tick that is in the same cadence slot as `idx` for `modulus`, near `base`.
    fn cadence_tick(base: u64, modulus: u64, idx: usize) -> u64 {
        base - base % modulus + idx as u64 % modulus
    }

    #[test]
    fn a_child_who_has_drifted_off_is_walked_back_beside_its_mother() {
        let mut sim = open_ground();
        let (mother, child) = (0, 1);
        place(&mut sim, mother, 100.0, 100.0);
        place(&mut sim, child, 112.0, 100.0);
        make_child(&mut sim, child, mother);
        sim.tick_count = 5000;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let ids = index_of(&sim);

        sim.assign_family_outing(child, &spatial, &ids);

        let target = sim.organisms[child]
            .wander_target
            .expect("the child is walked back");
        assert!(
            chebyshev(target, (100, 100)) <= 1,
            "target {target:?} is not beside the mother"
        );
    }

    #[test]
    fn a_child_beside_its_mother_plays_with_a_playmate_near_home() {
        let mut sim = open_ground();
        let (mother, child, mate) = (0, 1, 2);
        place(&mut sim, mother, 100.0, 100.0);
        place(&mut sim, child, 101.0, 100.0);
        place(&mut sim, mate, 103.0, 102.0);
        make_child(&mut sim, child, mother);
        make_child(&mut sim, mate, mother);
        sim.organisms[mate].lineage_id = sim.organisms[mother].lineage_id.clone();
        sim.tick_count = cadence_tick(5000, 120, child);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let ids = index_of(&sim);

        sim.assign_family_outing(child, &spatial, &ids);

        assert_eq!(sim.organisms[child].wander_target, Some((103, 102)));
        assert_eq!(sim.organisms[child].thought, "playing with friends");
    }

    #[test]
    fn an_orphan_keeps_to_the_family_home() {
        let mut sim = open_ground();
        let child = 1;
        place(&mut sim, child, 120.0, 100.0);
        make_child(&mut sim, child, 0);
        sim.organisms[child].parent_id = "gone".into();
        sim.organisms[child].home_x = 100.0;
        sim.organisms[child].home_y = 100.0;
        sim.tick_count = 5000;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let ids = index_of(&sim);

        sim.assign_family_outing(child, &spatial, &ids);

        let target = sim.organisms[child].wander_target.expect("walks home");
        assert!(chebyshev(target, (100, 100)) <= 1);
    }

    #[test]
    fn an_elder_walks_to_the_campfire_after_dark_and_children_there_learn_a_little() {
        let mut sim = open_ground();
        let (elder, child) = (0, 1);
        place(&mut sim, elder, 100.0, 100.0);
        place(&mut sim, child, 110.0, 100.0);
        sim.organisms[elder].age = 3000;
        sim.organisms[elder].max_age = 4000;
        make_child(&mut sim, child, elder);
        sim.grid.set(104, 100, Tile::Campfire);
        let night = 3 * DAY_LENGTH + DAY_LENGTH * 9 / 10;
        sim.tick_count = cadence_tick(night, 90, elder);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let ids = index_of(&sim);

        sim.assign_family_outing(elder, &spatial, &ids);
        assert_eq!(sim.organisms[elder].wander_target, Some((104, 100)));

        // Sitting by the fire, the elder teaches the child nearby.
        sim.organisms[elder].x = 104.0;
        sim.organisms[elder].wander_target = None;
        sim.organisms[child].x = 106.0;
        sim.organisms[child].literacy = 0.0;
        sim.tick_count = cadence_tick(night, 30, elder);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        sim.assign_family_outing(elder, &spatial, &ids);
        assert!(sim.organisms[child].literacy > 0.0);
    }

    #[test]
    fn an_elder_does_not_leave_its_place_for_the_fire_by_day() {
        let mut sim = open_ground();
        let elder = 0;
        place(&mut sim, elder, 100.0, 100.0);
        sim.organisms[elder].age = 3000;
        sim.organisms[elder].max_age = 4000;
        sim.grid.set(104, 100, Tile::Campfire);
        sim.tick_count = cadence_tick(DAY_LENGTH * 3 + 10, 90, elder);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let ids = index_of(&sim);

        sim.assign_family_outing(elder, &spatial, &ids);

        assert!(sim.organisms[elder].wander_target.is_none());
    }
}
