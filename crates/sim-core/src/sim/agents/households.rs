//! Households: who lives where, and who looks after whom at home.
//!
//! Two people who become partners move into one home: the younger of them
//! goes to live where the older one already lives, so the couple sleeps under
//! one roof. A grown child whose parent is an elder and short of food walks to
//! them and brings what they need, so an old person is fed by the family.

use super::age_stage::AgeStage;
use super::family_outings::chebyshev;
use crate::hashing::FxHashMap;
use crate::sim::simulation::Simulation;

/// An elder with less energy than this is brought food by a grown child.
const ELDER_HUNGRY: f32 = 0.45;
/// A child with less energy than this does not carry food to anyone.
const CHILD_SPARE: f32 = 0.55;
/// A child looks in on an elder parent this often (per person, in ticks).
const CARE_STEP: u64 = 15;
/// Food carried to an elder, in energy.
const DELIVERY: f32 = 0.12;
/// How far from its elder a child may be and still walk over with food.
const CARE_RANGE: i32 = 25;

impl Simulation {
    /// Partners move into one home: the younger one moves to the older one's home.
    pub(crate) fn share_home(&mut self, a: usize, b: usize) {
        let tick = self.tick_count;
        let (mover, host) = if self.organisms[a].age < self.organisms[b].age {
            (a, b)
        } else {
            (b, a)
        };
        let (hx, hy) = (self.organisms[host].home_x, self.organisms[host].home_y);
        if (hx, hy) == (self.organisms[mover].home_x, self.organisms[mover].home_y) {
            return;
        }
        let host_name = self.organisms[host].name.clone();
        let host_id = self.organisms[host].id.clone();
        let mover_name = self.organisms[mover].name.clone();
        let mover_id = self.organisms[mover].id.clone();
        let m = &mut self.organisms[mover];
        m.home_x = hx;
        m.home_y = hy;
        m.log_life_rel(
            tick,
            "household",
            format!("moved in with {host_name}"),
            Some(host_id),
            Some(host_name.clone()),
        );
        self.organisms[host].log_life_rel(
            tick,
            "household",
            format!("{mover_name} moved in with me"),
            Some(mover_id),
            Some(mover_name),
        );
    }

    /// A grown child whose elder parent is short of food walks over and brings some. Runs on a cadence per child.
    pub(crate) fn care_for_elder_parent(&mut self, idx: usize, org_idx_by_id: &FxHashMap<String, usize>) {
        let tick = self.tick_count;
        if tick % CARE_STEP != idx as u64 % CARE_STEP {
            return;
        }
        {
            let o = &self.organisms[idx];
            if !o.alive
                || o.journey.is_some()
                || o.wander_target.is_some()
                || o.energy < CHILD_SPARE
                || !matches!(
                    AgeStage::from_age(o.age, o.max_age),
                    AgeStage::Adult | AgeStage::Elder
                )
            {
                return;
            }
        }
        let parents = [
            Some(self.organisms[idx].parent_id.clone()),
            self.organisms[idx].father_id.clone(),
        ];
        let elder = parents
            .into_iter()
            .flatten()
            .filter(|id| !id.is_empty())
            .filter_map(|id| org_idx_by_id.get(&id).copied())
            .filter(|&p| {
                let e = &self.organisms[p];
                e.alive && e.energy < ELDER_HUNGRY && AgeStage::from_age(e.age, e.max_age) == AgeStage::Elder
            })
            .min();
        let Some(elder) = elder else {
            return;
        };
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let there = (self.organisms[elder].x as i32, self.organisms[elder].y as i32);
        if chebyshev(here, there) > CARE_RANGE {
            return;
        }
        if chebyshev(here, there) > 2 {
            self.set_outing_target(idx, there);
            return;
        }
        // Close enough: hand over the food.
        let elder_name = self.organisms[elder].name.clone();
        let child_name = self.organisms[idx].name.clone();
        let child_id = self.organisms[idx].id.clone();
        self.organisms[idx].energy = (self.organisms[idx].energy - DELIVERY / 2.0).max(0.0);
        let e = &mut self.organisms[elder];
        e.energy = (e.energy + DELIVERY).min(1.0);
        let trust = e.org_trust.entry(child_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.05).min(1.0);
        self.organisms[idx].think(
            &format!("bringing food to {}", &elder_name[..4.min(elder_name.len())]),
            tick,
        );
        self.organisms[elder].log_life_rel(
            tick,
            "care",
            format!("fed by my child {child_name}"),
            Some(child_id),
            Some(child_name),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::tiles::Tile;

    fn person(sim: &mut Simulation, i: usize, x: f32, y: f32, age: u32) {
        let o = &mut sim.organisms[i];
        o.alive = true;
        o.x = x;
        o.y = y;
        o.age = age;
        o.max_age = 4000;
        o.home_x = x;
        o.home_y = y;
        o.energy = 0.9;
        o.hydration = 0.9;
        o.fear_level = 0.0;
        o.journey = None;
        o.wander_target = None;
    }

    fn index_of(sim: &Simulation) -> FxHashMap<String, usize> {
        sim.organisms
            .iter()
            .enumerate()
            .map(|(i, o)| (o.id.clone(), i))
            .collect()
    }

    #[test]
    fn the_younger_partner_moves_in_with_the_older_one() {
        let mut sim = Simulation::new(97);
        sim.organisms.truncate(2);
        person(&mut sim, 0, 100.0, 100.0, 1500);
        person(&mut sim, 1, 130.0, 100.0, 2600);

        sim.share_home(0, 1);

        assert_eq!((sim.organisms[0].home_x, sim.organisms[0].home_y), (130.0, 100.0));
        assert_eq!((sim.organisms[1].home_x, sim.organisms[1].home_y), (130.0, 100.0));
        assert!(sim.organisms[0]
            .life_log
            .iter()
            .any(|e| e.category == "household"));
    }

    #[test]
    fn a_grown_child_walks_to_a_hungry_elder_parent_and_brings_food() {
        let mut sim = Simulation::new(99);
        sim.organisms.truncate(2);
        for x in 95..=110 {
            for y in 95..=105 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        let (elder, child) = (0, 1);
        person(&mut sim, elder, 100.0, 100.0, 3200);
        person(&mut sim, child, 104.0, 100.0, 2000);
        sim.organisms[elder].energy = 0.2;
        let elder_id = sim.organisms[elder].id.clone();
        sim.organisms[child].parent_id = elder_id;
        let ids = index_of(&sim);
        // A tick on the child's care cadence.
        sim.tick_count = 15 * 300 + child as u64;

        sim.care_for_elder_parent(child, &ids);
        assert_eq!(sim.organisms[child].wander_target, Some((100, 100)));

        sim.organisms[child].x = 101.0;
        sim.organisms[child].wander_target = None;
        sim.care_for_elder_parent(child, &ids);
        assert!(sim.organisms[elder].energy > 0.2, "the elder is fed");
    }
}
