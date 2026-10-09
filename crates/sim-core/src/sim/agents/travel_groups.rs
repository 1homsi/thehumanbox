//! Travelling as a group. When a leader of a tribe sets out on a journey, the
//! adults of that tribe who are idle and close by set out for the same place,
//! so a tribe moves as one body. The journey is the leader's own; a follower
//! only joins it, and drops out when it arrives or expires like any other.

use super::age_stage::AgeStage;
use super::family_outings::chebyshev;
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;

/// Followers must be this close to the leader (in tiles) to fall in behind them.
const FOLLOW_RANGE: i32 = 8;
/// A follower already this close to the journey's end does not set out.
const NEAR_END: i32 = 4;

impl Simulation {
    /// An idle adult near a tribe's leader on a journey falls in behind them and travels to the same place.
    pub(crate) fn fall_in_behind_leader(&mut self, idx: usize, spatial: &SpatialIndex) {
        let tick = self.tick_count;
        if tick % 20 != idx as u64 % 20 {
            return;
        }
        {
            let o = &self.organisms[idx];
            if !o.alive
                || o.journey.is_some()
                || o.wander_target.is_some()
                || o.energy < 0.4
                || o.hydration < 0.4
                || o.fear_level > 0.5
                || !matches!(
                    AgeStage::from_age(o.age, o.max_age),
                    AgeStage::Adult | AgeStage::Elder
                )
            {
                return;
            }
        }
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let lineage = self.organisms[idx].lineage_id.clone();
        let leader = spatial
            .query(here.0, here.1, FOLLOW_RANGE)
            .into_iter()
            .filter(|&i| i != idx)
            .filter(|&i| {
                let l = &self.organisms[i];
                l.alive && l.is_leader && l.lineage_id == lineage && l.journey.is_some()
            })
            .map(|i| {
                let l = &self.organisms[i];
                let d = chebyshev(here, (l.x as i32, l.y as i32));
                (d, i)
            })
            .filter(|(d, _)| *d <= FOLLOW_RANGE)
            .min();
        let Some((_, leader)) = leader else {
            return;
        };
        let Some(journey) = self.organisms[leader].journey.clone() else {
            return;
        };
        if chebyshev(here, journey.target) <= NEAR_END {
            return;
        }
        if self.organisms[idx]
            .route
            .borrow()
            .recently_blocked(journey.target)
        {
            return;
        }
        let leader_name = self.organisms[leader].name.clone();
        let short = &leader_name[..4.min(leader_name.len())];
        self.organisms[idx].begin_journey(journey.target, &format!("travelling behind {short}"), tick);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn adult(sim: &mut Simulation, i: usize, x: f32, y: f32) {
        let o = &mut sim.organisms[i];
        o.alive = true;
        o.x = x;
        o.y = y;
        o.lineage_id = "clan".into();
        o.age = 2000;
        o.max_age = 4000;
        o.energy = 0.9;
        o.hydration = 0.9;
        o.fear_level = 0.0;
        o.journey = None;
        o.wander_target = None;
    }

    #[test]
    fn an_idle_adult_beside_a_leader_on_a_journey_sets_out_for_the_same_place() {
        let mut sim = Simulation::new(93);
        sim.organisms.truncate(3);
        let (leader, follower) = (0, 1);
        adult(&mut sim, leader, 100.0, 100.0);
        adult(&mut sim, follower, 103.0, 100.0);
        sim.organisms[leader].is_leader = true;
        sim.organisms[leader].begin_journey((140, 100), "exploring distant land", 0);
        sim.tick_count = 4000 + follower as u64;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        sim.fall_in_behind_leader(follower, &spatial);

        let journey = sim.organisms[follower]
            .journey
            .clone()
            .expect("the follower sets out");
        assert_eq!(journey.target, (140, 100));
        assert!(journey.description.starts_with("travelling behind"));
    }

    #[test]
    fn a_leader_who_is_not_travelling_leaves_the_others_alone() {
        let mut sim = Simulation::new(93);
        sim.organisms.truncate(3);
        let (leader, follower) = (0, 1);
        adult(&mut sim, leader, 100.0, 100.0);
        adult(&mut sim, follower, 103.0, 100.0);
        sim.organisms[leader].is_leader = true;
        sim.tick_count = 4000 + follower as u64;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        sim.fall_in_behind_leader(follower, &spatial);

        assert!(sim.organisms[follower].journey.is_none());
    }
}
