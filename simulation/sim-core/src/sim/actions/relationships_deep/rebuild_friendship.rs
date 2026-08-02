use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::Organism,
    sim::{simulation::Simulation, spatial::SpatialIndex, warfare::has_active_battle_between},
};

const REPAIR_COOLDOWN: u64 = 600;
const MIN_ENERGY: f32 = 0.25;
const ENERGY_COST: f32 = 0.03;
const MAX_DISTANCE: f32 = 6.0;
const MIN_TRUST_TO_MEET: f32 = -0.35;
const MIN_ATTITUDE_TO_MEET: f32 = -0.40;
const MIN_TRUST_TO_ACCEPT: f32 = -0.05;
const MIN_ATTITUDE_TO_ACCEPT: f32 = -0.15;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Response {
    Accepted,
    Refused,
}

fn cooldown_key(other_id: &str) -> String {
    format!("rebuild_friendship:{other_id}")
}

fn ready_for_repair(person: &Organism, other_id: &str, tick: u64) -> bool {
    let key = cooldown_key(other_id);
    person
        .last_think_by_kind
        .get(&key)
        .is_none_or(|last| tick.saturating_sub(*last) >= REPAIR_COOLDOWN)
}

fn former_friendship(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    actor.former_friends.contains_key(&target.id) || target.former_friends.contains_key(&actor.id)
}

fn mutual_attitudes(actor: &Organism, target: &Organism) -> (f32, f32) {
    if actor.lineage_id == target.lineage_id {
        (1.0, 1.0)
    } else {
        (
            actor.attitude_toward(&target.lineage_id),
            target.attitude_toward(&actor.lineage_id),
        )
    }
}

fn can_attempt(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_trust = actor.org_trust.get(&target.id).copied().unwrap_or(0.0);
    let target_trust = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    let (actor_attitude, target_attitude) = mutual_attitudes(actor, target);

    actor_idx != target_idx
        && actor.alive
        && target.alive
        && actor.energy >= MIN_ENERGY
        && former_friendship(sim, actor_idx, target_idx)
        && !actor.friends.contains_key(&target.id)
        && !target.friends.contains_key(&actor.id)
        && actor_trust >= MIN_TRUST_TO_MEET
        && target_trust >= MIN_TRUST_TO_MEET
        && actor_attitude >= MIN_ATTITUDE_TO_MEET
        && target_attitude >= MIN_ATTITUDE_TO_MEET
        && actor.anger < 0.75
        && target.anger < 0.85
        && ready_for_repair(actor, &target.id, sim.tick_count)
        && ready_for_repair(target, &actor.id, sim.tick_count)
        && !has_active_battle_between(&sim.battles, &actor.lineage_id, &target.lineage_id)
        && (target.x - actor.x).abs() + (target.y - actor.y).abs() <= MAX_DISTANCE
}

fn response(sim: &Simulation, actor_idx: usize, target_idx: usize) -> Response {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_trust = actor.org_trust.get(&target.id).copied().unwrap_or(0.0);
    let target_trust = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    let (actor_attitude, target_attitude) = mutual_attitudes(actor, target);

    if actor_trust >= MIN_TRUST_TO_ACCEPT
        && target_trust >= MIN_TRUST_TO_ACCEPT
        && actor_attitude >= MIN_ATTITUDE_TO_ACCEPT
        && target_attitude >= MIN_ATTITUDE_TO_ACCEPT
        && actor.anger <= 0.45
        && target.anger <= 0.45
    {
        Response::Accepted
    } else {
        Response::Refused
    }
}

fn choose_target(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    nearby
        .iter()
        .copied()
        .filter(|&target_idx| can_attempt(sim, actor_idx, target_idx))
        .max_by(|&left_idx, &right_idx| {
            let left = &sim.organisms[left_idx];
            let right = &sim.organisms[right_idx];
            let left_trust = actor.org_trust.get(&left.id).copied().unwrap_or(0.0)
                + left.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let right_trust = actor.org_trust.get(&right.id).copied().unwrap_or(0.0)
                + right.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let left_anger = actor.anger + left.anger;
            let right_anger = actor.anger + right.anger;
            let left_distance = (left.x - actor.x).abs() + (left.y - actor.y).abs();
            let right_distance = (right.x - actor.x).abs() + (right.y - actor.y).abs();
            left_trust
                .total_cmp(&right_trust)
                .then_with(|| right_anger.total_cmp(&left_anger))
                .then_with(|| right_distance.total_cmp(&left_distance))
                .then_with(|| right.id.cmp(&left.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_target(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(target_idx) = choose_target(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no broken friendship is ready to mend");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let target_id = ctx.sim.organisms[target_idx].id.clone();
    let target_name = ctx.sim.organisms[target_idx].name.clone();
    let target_lineage = ctx.sim.organisms[target_idx].lineage_id.clone();
    let response = response(ctx.sim, ctx.idx, target_idx);
    let actor_key = cooldown_key(&target_id);
    let target_key = cooldown_key(&actor_id);

    // Imported or old saves may only have one side of an estrangement. Make
    // the relationship symmetric before resolving the attempt.
    ctx.sim.organisms[ctx.idx]
        .former_friends
        .entry(target_id.clone())
        .or_insert_with(|| target_name.clone());
    ctx.sim.organisms[target_idx]
        .former_friends
        .entry(actor_id.clone())
        .or_insert_with(|| actor_name.clone());
    ctx.sim.organisms[ctx.idx].mark_thought(&actor_key, ctx.tick);
    ctx.sim.organisms[target_idx].mark_thought(&target_key, ctx.tick);
    ctx.sim.organisms[ctx.idx].energy = (ctx.sim.organisms[ctx.idx].energy - ENERGY_COST).max(0.0);

    match response {
        Response::Accepted => {
            {
                let actor = &mut ctx.sim.organisms[ctx.idx];
                let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.18).min(1.0);
                actor.anger = (actor.anger - 0.22).max(0.0);
                actor.regret = (actor.regret - 0.18).max(0.0);
                actor.comfort = (actor.comfort + 0.08).min(1.0);
                actor.loneliness = (actor.loneliness - 0.15).max(0.0);
                actor.joy_ticks = actor.joy_ticks.saturating_add(160).min(1_200);
                if actor_lineage != target_lineage {
                    actor.update_attitude(&target_lineage, 0.04);
                }
            }
            {
                let target = &mut ctx.sim.organisms[target_idx];
                let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.18).min(1.0);
                target.anger = (target.anger - 0.22).max(0.0);
                target.regret = (target.regret - 0.10).max(0.0);
                target.comfort = (target.comfort + 0.08).min(1.0);
                target.loneliness = (target.loneliness - 0.15).max(0.0);
                target.joy_ticks = target.joy_ticks.saturating_add(160).min(1_200);
                if actor_lineage != target_lineage {
                    target.update_attitude(&actor_lineage, 0.04);
                }
                target.think(&format!("rebuilding friendship with {actor_name}"), ctx.tick);
            }

            ctx.sim.organisms[ctx.idx].add_friend(&target_id, &target_name, ctx.tick);
            ctx.sim.organisms[target_idx].add_friend(&actor_id, &actor_name, ctx.tick);
            ctx.sim.organisms[ctx.idx].log_life_rel(
                ctx.tick,
                "friendship_rebuilt",
                format!("rebuilt my friendship with {target_name}"),
                Some(target_id.clone()),
                Some(target_name.clone()),
            );
            ctx.sim.organisms[target_idx].log_life_rel(
                ctx.tick,
                "friendship_rebuilt",
                format!("rebuilt my friendship with {actor_name}"),
                Some(actor_id),
                Some(actor_name.clone()),
            );
            ctx.think(&format!("rebuilding friendship with {target_name}"));
            ctx.event(
                "bond",
                &format!("{actor_name} and {target_name} rebuilt their friendship"),
            );
            0.018
        }
        Response::Refused => {
            {
                let actor = &mut ctx.sim.organisms[ctx.idx];
                let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
                *trust = (*trust - 0.02).max(-1.0);
                actor.comfort = (actor.comfort - 0.05).max(0.0);
                actor.regret = (actor.regret + 0.06).min(1.0);
                actor.log_life_rel(
                    ctx.tick,
                    "friendship_repair_refused",
                    format!("{target_name} was not ready to rebuild our friendship"),
                    Some(target_id.clone()),
                    Some(target_name.clone()),
                );
            }
            {
                let target = &mut ctx.sim.organisms[target_idx];
                let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust - 0.03).max(-1.0);
                target.anger = (target.anger + 0.04).min(1.0);
                target.log_life_rel(
                    ctx.tick,
                    "friendship_repair_refused",
                    format!("refused {actor_name}'s attempt to rebuild our friendship"),
                    Some(actor_id),
                    Some(actor_name.clone()),
                );
                target.think(&format!("not ready to forgive {actor_name}"), ctx.tick);
            }
            ctx.think(&format!("turned away by {target_name}"));
            ctx.event(
                "drama",
                &format!("{target_name} refused to rebuild a friendship with {actor_name}"),
            );
            -0.006
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::era::Era;

    fn repair_world() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0xF21E_2263);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let target = 1;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 90.0), (target, 91.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 90.0;
            sim.organisms[index].age = sim.organisms[index].max_age / 2;
            sim.organisms[index].energy = 0.80;
        }
        sim.lineage_eras.insert(lineage, Era::Stone);
        sim.tick_count = 3_000;
        (sim, actor, target)
    }

    fn estrange_pair(sim: &mut Simulation, actor: usize, target: usize) {
        let actor_id = sim.organisms[actor].id.clone();
        let actor_name = sim.organisms[actor].name.clone();
        let target_id = sim.organisms[target].id.clone();
        let target_name = sim.organisms[target].name.clone();
        sim.organisms[actor]
            .former_friends
            .insert(target_id.clone(), target_name);
        sim.organisms[target]
            .former_friends
            .insert(actor_id.clone(), actor_name);
        sim.organisms[actor].acquaintances.insert(target_id);
        sim.organisms[target].acquaintances.insert(actor_id);
    }

    fn rotate_until_visible(sim: &mut Simulation, actor: usize) -> bool {
        for _ in 0..50 {
            let spatial = SpatialIndex::build(&sim.organisms, 10);
            let x = sim.organisms[actor].x as i32;
            let y = sim.organisms[actor].y as i32;
            if crate::sim::actions::available_actions(sim, actor, x, y, &spatial).contains(&2263) {
                return true;
            }
            sim.tick_count += 30;
        }
        false
    }

    #[test]
    fn action_is_hidden_and_forced_application_is_rejected_without_a_former_friend() {
        let (mut sim, actor, _target) = repair_world();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!can_apply(&sim, actor, &spatial));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 2263, 90, 90, &spatial),
            None
        );
    }

    #[test]
    fn ready_former_friends_restore_the_bond_for_both_people_and_persist() {
        let (mut sim, actor, target) = repair_world();
        let actor_id = sim.organisms[actor].id.clone();
        let actor_name = sim.organisms[actor].name.clone();
        let target_id = sim.organisms[target].id.clone();
        let target_name = sim.organisms[target].name.clone();
        estrange_pair(&mut sim, actor, target);
        sim.organisms[actor].org_trust.insert(target_id.clone(), 0.08);
        sim.organisms[target].org_trust.insert(actor_id.clone(), 0.06);
        sim.organisms[actor].anger = 0.20;
        sim.organisms[target].anger = 0.25;
        assert!(rotate_until_visible(&mut sim, actor));

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 2263, 90, 90, &spatial).is_some());
        assert_eq!(sim.organisms[actor].friends.get(&target_id), Some(&target_name));
        assert_eq!(sim.organisms[target].friends.get(&actor_id), Some(&actor_name));
        assert!(!sim.organisms[actor].former_friends.contains_key(&target_id));
        assert!(!sim.organisms[target].former_friends.contains_key(&actor_id));
        assert!(sim.organisms[actor].org_trust[&target_id] > 0.08);
        assert!(sim.organisms[target].org_trust[&actor_id] > 0.06);
        assert!(sim.organisms[actor]
            .life_log
            .iter()
            .any(|entry| entry.category == "friendship_rebuilt"));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|person| person.id == actor_id)
            .unwrap();
        let loaded_target = loaded
            .organisms
            .iter()
            .find(|person| person.id == target_id)
            .unwrap();
        assert_eq!(loaded_actor.friends.get(&target_id), Some(&target_name));
        assert_eq!(loaded_target.friends.get(&actor_id), Some(&actor_name));
        assert!(loaded_actor
            .last_think_by_kind
            .contains_key(&cooldown_key(&target_id)));
        assert!(loaded_target
            .last_think_by_kind
            .contains_key(&cooldown_key(&actor_id)));
    }

    #[test]
    fn unresolved_hurt_causes_refusal_and_shared_retry_cooldown() {
        let (mut sim, actor, target) = repair_world();
        let actor_id = sim.organisms[actor].id.clone();
        let target_id = sim.organisms[target].id.clone();
        estrange_pair(&mut sim, actor, target);
        sim.organisms[actor].org_trust.insert(target_id.clone(), 0.05);
        sim.organisms[target].org_trust.insert(actor_id.clone(), -0.10);
        assert!(rotate_until_visible(&mut sim, actor));
        let attempt_tick = sim.tick_count;

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = crate::sim::actions::try_apply(&mut sim, actor, 2263, 90, 90, &spatial).unwrap();
        assert!(reward < 0.0);
        assert!(!sim.organisms[actor].friends.contains_key(&target_id));
        assert!(!sim.organisms[target].friends.contains_key(&actor_id));
        assert!(sim.organisms[actor].former_friends.contains_key(&target_id));
        assert!(sim.organisms[target].former_friends.contains_key(&actor_id));
        assert!(sim.organisms[actor]
            .life_log
            .iter()
            .any(|entry| entry.category == "friendship_repair_refused"));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor_idx = loaded
            .organisms
            .iter()
            .position(|person| person.id == actor_id)
            .unwrap();
        let mut loaded = loaded;
        loaded.tick_count = attempt_tick + REPAIR_COOLDOWN - 1;
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(!can_apply(&loaded, loaded_actor_idx, &spatial));
        loaded.tick_count += 1;
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(can_apply(&loaded, loaded_actor_idx, &spatial));
    }
}
