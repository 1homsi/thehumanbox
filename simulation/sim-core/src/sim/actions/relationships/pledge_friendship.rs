use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const ACTOR_TRUST_REQUIRED: f32 = 0.25;
const PARTNER_TRUST_REQUIRED: f32 = 0.20;

fn choose_friendship_candidate(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    nearby
        .iter()
        .copied()
        .filter(|&index| {
            let other = &sim.organisms[index];
            index != actor_idx
                && other.alive
                && !actor.friends.contains_key(&other.id)
                && !other.friends.contains_key(&actor.id)
                && actor.org_trust.get(&other.id).copied().unwrap_or(0.0) >= ACTOR_TRUST_REQUIRED
                && other.org_trust.get(&actor.id).copied().unwrap_or(0.0) >= PARTNER_TRUST_REQUIRED
                && (other.x - actor.x).abs() + (other.y - actor.y).abs() <= 6.0
        })
        .max_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_mutual = actor.org_trust.get(&left_org.id).copied().unwrap_or(0.0)
                + left_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let right_mutual = actor.org_trust.get(&right_org.id).copied().unwrap_or(0.0)
                + right_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let left_distance = (left_org.x - actor.x).abs() + (left_org.y - actor.y).abs();
            let right_distance = (right_org.x - actor.x).abs() + (right_org.y - actor.y).abs();
            left_mutual
                .total_cmp(&right_mutual)
                .then_with(|| right_distance.total_cmp(&left_distance))
                .then_with(|| right_org.id.cmp(&left_org.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_friendship_candidate(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(friend_idx) = choose_friendship_candidate(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no mutual friendship ready to pledge");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let friend_id = ctx.sim.organisms[friend_idx].id.clone();
    let friend_name = ctx.sim.organisms[friend_idx].name.clone();
    let friend_lineage = ctx.sim.organisms[friend_idx].lineage_id.clone();

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(friend_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.15).min(1.0);
        actor.comfort = (actor.comfort + 0.08).min(1.0);
        actor.loneliness = (actor.loneliness - 0.12).max(0.0);
        actor.joy_ticks = actor.joy_ticks.saturating_add(120).min(1_200);
        if friend_lineage != actor_lineage {
            actor.update_attitude(&friend_lineage, 0.03);
        }
    }
    {
        let friend = &mut ctx.sim.organisms[friend_idx];
        let trust = friend.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.15).min(1.0);
        friend.comfort = (friend.comfort + 0.08).min(1.0);
        friend.loneliness = (friend.loneliness - 0.12).max(0.0);
        friend.joy_ticks = friend.joy_ticks.saturating_add(120).min(1_200);
        if friend_lineage != actor_lineage {
            friend.update_attitude(&actor_lineage, 0.03);
        }
        friend.think(&format!("pledging friendship with {actor_name}"), ctx.tick);
    }

    // Eligibility is mutual, so the pledge commits the existing relationship
    // into the durable named-friend system for both people immediately.
    ctx.sim.organisms[ctx.idx].add_friend(&friend_id, &friend_name, ctx.tick);
    ctx.sim.organisms[friend_idx].add_friend(&actor_id, &actor_name, ctx.tick);

    ctx.think(&format!("pledging friendship with {friend_name}"));
    ctx.discover(
        "friendship_pledge",
        &format!("pledged lasting friendship with {friend_name}"),
    );
    ctx.event(
        "bond",
        &format!("{actor_name} and {friend_name} pledged lasting friendship"),
    );
    0.016
}

#[cfg(test)]
mod tests {
    use super::*;

    fn friendship_world() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0xF21E_0D01);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let friend = 1;
        sim.organisms[actor].alive = true;
        sim.organisms[friend].alive = true;
        sim.organisms[actor].x = 120.0;
        sim.organisms[actor].y = 120.0;
        sim.organisms[friend].x = 121.0;
        sim.organisms[friend].y = 120.0;
        sim.tick_count = 900;
        (sim, actor, friend)
    }

    #[test]
    fn mutual_trust_becomes_a_named_friendship_for_both_people() {
        let (mut sim, actor, friend) = friendship_world();
        let actor_id = sim.organisms[actor].id.clone();
        let actor_name = sim.organisms[actor].name.clone();
        let friend_id = sim.organisms[friend].id.clone();
        let friend_name = sim.organisms[friend].name.clone();
        sim.organisms[actor].org_trust.insert(friend_id.clone(), 0.30);
        sim.organisms[friend].org_trust.insert(actor_id.clone(), 0.25);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 120, 120, &spatial);

        assert!(apply(&mut ctx) > 0.0);

        assert_eq!(sim.organisms[actor].friends.get(&friend_id), Some(&friend_name));
        assert_eq!(sim.organisms[friend].friends.get(&actor_id), Some(&actor_name));
        assert!((sim.organisms[actor].org_trust[&friend_id] - 0.45).abs() < f32::EPSILON);
        assert!((sim.organisms[friend].org_trust[&actor_id] - 0.40).abs() < f32::EPSILON);
        assert!(sim.organisms[actor]
            .life_log
            .iter()
            .any(|entry| entry.category == "friendship"));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        let loaded_friend = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == friend_id)
            .unwrap();
        assert_eq!(loaded_actor.friends.get(&friend_id), Some(&friend_name));
        assert_eq!(loaded_friend.friends.get(&actor_id), Some(&actor_name));
    }

    #[test]
    fn trusted_people_from_different_lineages_can_commit_to_friendship() {
        let (mut sim, actor, friend) = friendship_world();
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let friend_lineage = "foreign-friend".to_string();
        let actor_id = sim.organisms[actor].id.clone();
        let friend_id = sim.organisms[friend].id.clone();
        sim.organisms[friend].lineage_id.clone_from(&friend_lineage);
        sim.organisms[actor].org_trust.insert(friend_id, 0.30);
        sim.organisms[friend].org_trust.insert(actor_id, 0.25);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 120, 120, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[actor].attitude_toward(&friend_lineage) > 0.0);
        assert!(sim.organisms[friend].attitude_toward(&actor_lineage) > 0.0);
    }

    #[test]
    fn action_requires_mutual_trust_and_cannot_repeat_an_existing_friendship() {
        let (mut sim, actor, friend) = friendship_world();
        let actor_id = sim.organisms[actor].id.clone();
        let friend_id = sim.organisms[friend].id.clone();
        sim.organisms[actor].org_trust.insert(friend_id.clone(), 0.30);
        sim.organisms[friend].org_trust.insert(actor_id.clone(), 0.10);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 120, 120, &spatial).contains(&233));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 233, 120, 120, &spatial),
            None
        );

        sim.organisms[friend].org_trust.insert(actor_id.clone(), 0.25);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, actor, 120, 120, &spatial).contains(&233));
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 233, 120, 120, &spatial).is_some());

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 120, 120, &spatial).contains(&233));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 233, 120, 120, &spatial),
            None
        );
    }
}
