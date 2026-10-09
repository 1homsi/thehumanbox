//! Friends and rivals in everyday life.
//!
//! A rival is someone whose personal trust toward you has fallen to
//! `RIVAL_TRUST` or below, the same line the card uses. Rivalries come from
//! arguments, and from two people going after the same mate (see
//! `mark_mate_rivals`). A rival who is close by is stepped away from, and a
//! person who is not courting anyone never picks a rival to court. Friends who
//! have drifted apart walk to each other now and then.

use super::family_outings::chebyshev;
use crate::hashing::FxHashMap;
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;
use crate::world::grid::{HEIGHT, WIDTH};

/// Personal trust at or below this is a rivalry.
pub(crate) const RIVAL_TRUST: f32 = -0.2;
/// The trust two people competing for the same mate end up with toward each other.
pub(crate) const COMPETITOR_TRUST: f32 = -0.25;
/// Rivals this close step away from each other.
const KEEP_AWAY: i32 = 3;
/// How far a person steps away from a rival.
const STEP_AWAY: i32 = 7;
/// Friends further apart than this (in tiles) may walk to each other when idle.
const FRIEND_NEAR: i32 = 8;
/// Friends further apart than this are not worth the walk.
const FRIEND_FAR: i32 = 30;
/// Competitors for a mate must be within this many tiles of the person.
const COMPETE_RANGE: i32 = 30;

fn short(name: &str) -> &str {
    &name[..4.min(name.len())]
}

impl Simulation {
    fn grid_pos(&self, idx: usize) -> (i32, i32) {
        (self.organisms[idx].x as i32, self.organisms[idx].y as i32)
    }

    /// An idle person with a rival within three tiles steps away from them.
    pub(crate) fn keep_away_from_rivals(&mut self, idx: usize, org_idx_by_id: &FxHashMap<String, usize>) {
        let tick = self.tick_count;
        if tick % 10 != idx as u64 % 10 {
            return;
        }
        {
            let o = &self.organisms[idx];
            if !o.alive || o.journey.is_some() || o.wander_target.is_some() {
                return;
            }
        }
        let here = self.grid_pos(idx);
        let nearest_rival = self.organisms[idx]
            .org_trust
            .iter()
            .filter(|(_, &v)| v <= RIVAL_TRUST)
            .filter_map(|(id, _)| org_idx_by_id.get(id).copied())
            .filter(|&r| r != idx && self.organisms[r].alive)
            .map(|r| (chebyshev(here, self.grid_pos(r)), r))
            .filter(|(d, _)| *d <= KEEP_AWAY)
            .min();
        let Some((_, rival)) = nearest_rival else {
            return;
        };
        let there = self.grid_pos(rival);
        let mut dx = (here.0 - there.0).signum();
        let dy = (here.1 - there.1).signum();
        if dx == 0 && dy == 0 {
            dx = if idx.is_multiple_of(2) { 1 } else { -1 };
        }
        let target = (
            (here.0 + dx * STEP_AWAY).clamp(5, WIDTH as i32 - 5),
            (here.1 + dy * STEP_AWAY).clamp(5, HEIGHT as i32 - 5),
        );
        if self.set_outing_target(idx, target) {
            let name = short(&self.organisms[rival].name).to_string();
            self.organisms[idx].think(&format!("keeping away from {name}"), tick);
        }
    }

    /// An idle person with a friend a little way off walks over to them now and then.
    pub(crate) fn walk_to_a_friend(&mut self, idx: usize, org_idx_by_id: &FxHashMap<String, usize>) {
        let tick = self.tick_count;
        if tick % 200 != idx as u64 % 200 {
            return;
        }
        {
            let o = &self.organisms[idx];
            if !o.alive
                || o.journey.is_some()
                || o.wander_target.is_some()
                || o.energy < 0.4
                || o.hydration < 0.4
                || o.friends.is_empty()
            {
                return;
            }
        }
        // About one idle visit in three; the rest of the time the person does something else.
        if !(tick / 200 + idx as u64).is_multiple_of(3) {
            return;
        }
        let here = self.grid_pos(idx);
        let nearest_friend = self.organisms[idx]
            .friends
            .keys()
            .filter_map(|id| org_idx_by_id.get(id).copied())
            .filter(|&f| f != idx && self.organisms[f].alive)
            .map(|f| (chebyshev(here, self.grid_pos(f)), f))
            .filter(|(d, _)| (FRIEND_NEAR..=FRIEND_FAR).contains(d))
            .min();
        let Some((_, friend)) = nearest_friend else {
            return;
        };
        let there = self.grid_pos(friend);
        if self.set_outing_target(idx, there) {
            let name = short(&self.organisms[friend].name).to_string();
            self.organisms[idx].think(&format!("going to see {name}"), tick);
        }
    }

    /// Two unpartnered people of one sex who head for the same mate become rivals.
    pub(crate) fn mark_mate_rivals(&mut self, idx: usize, mate_at: (i32, i32), spatial: &SpatialIndex) {
        let my_sex = self.organisms[idx].sex;
        let here = self.grid_pos(idx);
        let competitors: Vec<usize> = spatial
            .query(here.0, here.1, COMPETE_RANGE)
            .into_iter()
            .filter(|&i| i != idx)
            .filter(|&i| {
                let o = &self.organisms[i];
                o.alive
                    && o.sex == my_sex
                    && o.partner_id.is_none()
                    && o.age > 1000
                    && o.wander_target.is_some_and(|wt| chebyshev(wt, mate_at) <= 3)
            })
            .collect();
        let tick = self.tick_count;
        for other in competitors {
            let (my_id, my_name) = (self.organisms[idx].id.clone(), self.organisms[idx].name.clone());
            let (their_id, their_name) = (
                self.organisms[other].id.clone(),
                self.organisms[other].name.clone(),
            );
            for (who, rival_id, rival_name) in [
                (idx, their_id.clone(), their_name.clone()),
                (other, my_id.clone(), my_name.clone()),
            ] {
                let trust = self.organisms[who]
                    .org_trust
                    .entry(rival_id.clone())
                    .or_insert(0.0);
                *trust = trust.min(COMPETITOR_TRUST);
                self.organisms[who].log_life_rel(
                    tick,
                    "rivalry",
                    format!("competing with {rival_name} for the same person"),
                    Some(rival_id),
                    Some(rival_name),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::tiles::Tile;

    fn open_ground() -> Simulation {
        let mut sim = Simulation::new(71);
        sim.organisms.truncate(4);
        for x in 85..=115 {
            for y in 90..=110 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for o in &mut sim.organisms {
            o.alive = true;
            o.energy = 0.9;
            o.hydration = 0.9;
            o.journey = None;
            o.wander_target = None;
            o.age = 1500;
            o.max_age = 4000;
        }
        sim
    }

    fn index_of(sim: &Simulation) -> FxHashMap<String, usize> {
        sim.organisms
            .iter()
            .enumerate()
            .map(|(i, o)| (o.id.clone(), i))
            .collect()
    }

    #[test]
    fn a_rival_within_three_tiles_is_stepped_away_from() {
        let mut sim = open_ground();
        sim.organisms[0].x = 100.0;
        sim.organisms[0].y = 100.0;
        sim.organisms[1].x = 102.0;
        sim.organisms[1].y = 100.0;
        let rival_id = sim.organisms[1].id.clone();
        sim.organisms[0].org_trust.insert(rival_id, -0.5);
        sim.tick_count = 5000;
        let ids = index_of(&sim);

        sim.keep_away_from_rivals(0, &ids);

        // The rival stands to the east, so the step is to the west.
        assert_eq!(sim.organisms[0].wander_target, Some((93, 100)));
        assert!(sim.organisms[0].thought.starts_with("keeping away from"));
    }

    #[test]
    fn two_people_going_after_the_same_mate_become_rivals() {
        let mut sim = open_ground();
        let (a, b) = (0, 1);
        sim.organisms[a].sex = crate::organism::organism::Sex::Male;
        sim.organisms[b].sex = crate::organism::organism::Sex::Male;
        sim.organisms[a].x = 100.0;
        sim.organisms[a].y = 100.0;
        sim.organisms[b].x = 104.0;
        sim.organisms[b].y = 100.0;
        sim.organisms[a].wander_target = Some((110, 100));
        sim.organisms[b].wander_target = Some((110, 101));
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        sim.mark_mate_rivals(a, (110, 100), &spatial);

        let (a_id, b_id) = (sim.organisms[a].id.clone(), sim.organisms[b].id.clone());
        assert!(sim.organisms[a].org_trust[&b_id] <= COMPETITOR_TRUST);
        assert!(sim.organisms[b].org_trust[&a_id] <= COMPETITOR_TRUST);
    }

    #[test]
    fn friends_apart_walk_to_each_other_when_idle() {
        let mut sim = open_ground();
        let (me, friend) = (0, 1);
        sim.organisms[me].x = 100.0;
        sim.organisms[me].y = 100.0;
        sim.organisms[friend].x = 115.0;
        sim.organisms[friend].y = 100.0;
        let friend_id = sim.organisms[friend].id.clone();
        sim.organisms[me].friends.insert(friend_id, "Friend".into());
        // A tick on this person's visit cadence, when the visit falls on the walk.
        sim.tick_count = 600;
        let ids = index_of(&sim);

        sim.walk_to_a_friend(me, &ids);

        assert_eq!(sim.organisms[me].wander_target, Some((115, 100)));
    }
}
