use super::{super::ctx::ActionCtx, greet_stranger::has_introduction};
use crate::sim::{simulation::Simulation, spatial::SpatialIndex, warfare::has_active_battle_between};

const BEFRIEND_COOLDOWN: u64 = 240;
const MIN_ENERGY: f32 = 0.25;
const ENERGY_COST: f32 = 0.02;
const PLEDGE_ACTOR_TRUST: f32 = 0.25;
const PLEDGE_TARGET_TRUST: f32 = 0.20;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Response {
    Accepted,
    Wary,
}

fn cooldown_key(other_id: &str) -> String {
    format!("befriend:{other_id}")
}

fn pair_ready(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    actor
        .last_think_by_kind
        .get(&cooldown_key(&target.id))
        .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= BEFRIEND_COOLDOWN)
        && target
            .last_think_by_kind
            .get(&cooldown_key(&actor.id))
            .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= BEFRIEND_COOLDOWN)
}

fn can_deepen(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_trust = actor.org_trust.get(&target.id).copied().unwrap_or(0.0);
    let target_trust = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    actor.lineage_id != target.lineage_id
        && has_introduction(actor, &target.id)
        && has_introduction(target, &actor.id)
        && !actor.friends.contains_key(&target.id)
        && !target.friends.contains_key(&actor.id)
        && (actor_trust < PLEDGE_ACTOR_TRUST || target_trust < PLEDGE_TARGET_TRUST)
        && actor_trust > -0.15
        && target_trust > -0.15
        && actor.attitude_toward(&target.lineage_id) > -0.20
        && target.attitude_toward(&actor.lineage_id) > -0.20
        && actor.anger < 0.75
        && target.anger < 0.75
        && pair_ready(sim, actor_idx, target_idx)
        && !has_active_battle_between(&sim.battles, &actor.lineage_id, &target.lineage_id)
}

fn response_to(sim: &Simulation, actor_idx: usize, target_idx: usize) -> Response {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_trust = actor.org_trust.get(&target.id).copied().unwrap_or(0.0);
    let target_trust = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    if actor_trust >= 0.02
        && target_trust >= 0.02
        && actor.attitude_toward(&target.lineage_id) >= -0.10
        && target.attitude_toward(&actor.lineage_id) >= -0.10
        && target.anger < 0.60
    {
        Response::Accepted
    } else {
        Response::Wary
    }
}

fn choose_candidate(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive || actor.energy < MIN_ENERGY {
        return None;
    }
    nearby
        .iter()
        .copied()
        .filter(|&target_idx| {
            let target = &sim.organisms[target_idx];
            target_idx != actor_idx
                && target.alive
                && can_deepen(sim, actor_idx, target_idx)
                && (target.x - actor.x).abs() + (target.y - actor.y).abs() <= 6.0
        })
        .max_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_mutual = actor.org_trust.get(&left_org.id).copied().unwrap_or(0.0)
                + left_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let right_mutual = actor.org_trust.get(&right_org.id).copied().unwrap_or(0.0)
                + right_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            left_mutual
                .total_cmp(&right_mutual)
                .then_with(|| right_org.id.cmp(&left_org.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_candidate(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(target_idx) = choose_candidate(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no introduced stranger is ready to know me better");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let target_id = ctx.sim.organisms[target_idx].id.clone();
    let target_name = ctx.sim.organisms[target_idx].name.clone();
    let target_lineage = ctx.sim.organisms[target_idx].lineage_id.clone();
    let response = response_to(ctx.sim, ctx.idx, target_idx);

    ctx.sim.organisms[ctx.idx]
        .last_think_by_kind
        .insert(cooldown_key(&target_id), ctx.tick);
    ctx.sim.organisms[target_idx]
        .last_think_by_kind
        .insert(cooldown_key(&actor_id), ctx.tick);
    match response {
        Response::Accepted => {
            {
                let actor = &mut ctx.sim.organisms[ctx.idx];
                actor.energy = (actor.energy - ENERGY_COST).max(0.0);
                actor.comfort = (actor.comfort + 0.05).min(1.0);
                actor.loneliness = (actor.loneliness - 0.06).max(0.0);
                actor.boredom = (actor.boredom - 0.07).max(0.0);
                let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.08).min(1.0);
                actor.update_attitude(&target_lineage, 0.02);
                actor.log_life_rel(
                    ctx.tick,
                    "friendship_overture",
                    format!("spent time getting to know {target_name}"),
                    Some(target_id.clone()),
                    Some(target_name.clone()),
                );
            }
            {
                let target = &mut ctx.sim.organisms[target_idx];
                target.comfort = (target.comfort + 0.05).min(1.0);
                target.loneliness = (target.loneliness - 0.06).max(0.0);
                target.boredom = (target.boredom - 0.07).max(0.0);
                let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.08).min(1.0);
                target.update_attitude(&actor_lineage, 0.02);
                target.think(&format!("enjoying time with {actor_name}"), ctx.tick);
                target.log_life_rel(
                    ctx.tick,
                    "friendship_overture",
                    format!("welcomed {actor_name}'s friendship"),
                    Some(actor_id.clone()),
                    Some(actor_name.clone()),
                );
            }
            ctx.think(&format!("getting to know {target_name}"));
            ctx.event(
                "bond",
                &format!("deepened a growing friendship with {target_name}"),
            );
            0.010
        }
        Response::Wary => {
            {
                let actor = &mut ctx.sim.organisms[ctx.idx];
                actor.energy = (actor.energy - ENERGY_COST).max(0.0);
                actor.comfort = (actor.comfort - 0.02).max(0.0);
                let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.01).min(1.0);
                actor.log_life_rel(
                    ctx.tick,
                    "friendship_overture",
                    format!("{target_name} remained wary of my friendship"),
                    Some(target_id.clone()),
                    Some(target_name.clone()),
                );
            }
            {
                let target = &mut ctx.sim.organisms[target_idx];
                let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.01).min(1.0);
                target.think(&format!("still wary of {actor_name}"), ctx.tick);
                target.log_life_rel(
                    ctx.tick,
                    "friendship_overture",
                    format!("remained wary when {actor_name} offered friendship"),
                    Some(actor_id.clone()),
                    Some(actor_name.clone()),
                );
            }
            ctx.think(&format!("giving wary {target_name} more time"));
            ctx.event(
                "social",
                &format!("offered friendship to {target_name}, who remained cautious"),
            );
            0.002
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn friendship_path_world() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0xBEF2_1E01);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let target = 1;
        sim.organisms[actor].alive = true;
        sim.organisms[target].alive = true;
        sim.organisms[actor].lineage_id = "river-lineage".into();
        sim.organisms[target].lineage_id = "forest-lineage".into();
        sim.organisms[actor].x = 130.0;
        sim.organisms[actor].y = 130.0;
        sim.organisms[target].x = 131.0;
        sim.organisms[target].y = 130.0;
        sim.organisms[actor].energy = 0.80;
        sim.organisms[target].energy = 0.80;
        let actor_id = sim.organisms[actor].id.clone();
        let target_id = sim.organisms[target].id.clone();
        sim.organisms[actor].org_trust.insert(target_id, 0.10);
        sim.organisms[target].org_trust.insert(actor_id, 0.10);
        sim.tick_count = 10_000;
        (sim, actor, target)
    }

    #[test]
    fn greeting_and_two_overtures_unlock_the_real_friendship_pledge() {
        let (mut sim, actor, target) = friendship_path_world();
        let actor_id = sim.organisms[actor].id.clone();
        let target_id = sim.organisms[target].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 85, 130, 130, &spatial).is_some());
        assert_eq!(sim.organisms[actor].org_trust[&target_id], 0.14);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 89, 130, 130, &spatial).is_some());
        assert!((sim.organisms[actor].org_trust[&target_id] - 0.22).abs() < f32::EPSILON);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 130, 130, &spatial).contains(&233));

        sim.tick_count += BEFRIEND_COOLDOWN;
        assert!(crate::sim::actions::try_apply(&mut sim, target, 89, 131, 130, &spatial).is_some());
        assert!((sim.organisms[actor].org_trust[&target_id] - 0.30).abs() < f32::EPSILON);
        assert!((sim.organisms[target].org_trust[&actor_id] - 0.30).abs() < f32::EPSILON);
        assert!(crate::sim::actions::available_actions(&sim, actor, 130, 130, &spatial).contains(&233));
        assert!(!crate::sim::actions::available_actions(&sim, actor, 130, 130, &spatial).contains(&89));
    }

    #[test]
    fn wary_introduction_does_not_jump_to_friendship_progress() {
        let (mut sim, actor, target) = friendship_path_world();
        let actor_id = sim.organisms[actor].id.clone();
        let target_id = sim.organisms[target].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 85, 130, 130, &spatial).is_some());
        sim.organisms[actor].org_trust.insert(target_id.clone(), -0.05);
        sim.organisms[target].org_trust.insert(actor_id.clone(), -0.05);

        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 89, 130, 130, &spatial),
            Some(0.002)
        );
        assert!((sim.organisms[actor].org_trust[&target_id] + 0.04).abs() < f32::EPSILON);
        assert!((sim.organisms[target].org_trust[&actor_id] + 0.04).abs() < f32::EPSILON);
        assert!(!sim.organisms[actor].friends.contains_key(&target_id));
    }

    #[test]
    fn befriend_requires_a_reciprocal_introduction_and_rejects_forced_use() {
        let (mut sim, actor, _) = friendship_path_world();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 130, 130, &spatial).contains(&89));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 89, 130, 130, &spatial),
            None
        );
    }

    #[test]
    fn shared_overture_cooldown_persists_and_reopens_at_the_boundary() {
        let (mut sim, actor, target) = friendship_path_world();
        let actor_id = sim.organisms[actor].id.clone();
        let target_id = sim.organisms[target].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 85, 130, 130, &spatial).is_some());
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 89, 130, 130, &spatial).is_some());

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded.organisms.iter().position(|o| o.id == actor_id).unwrap();
        let loaded_target = loaded.organisms.iter().position(|o| o.id == target_id).unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_actor, 130, 130, &spatial).contains(&89)
        );
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_target, 131, 130, &spatial).contains(&89)
        );
        loaded.tick_count += BEFRIEND_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_actor, 130, 130, &spatial).contains(&89)
        );
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_target, 131, 130, &spatial).contains(&89)
        );
    }
}
