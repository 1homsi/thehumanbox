use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const MIN_REGRET: f32 = 0.05;
const APOLOGY_MIN_AGE: u64 = 120;
const APOLOGY_MAX_AGE: u64 = 1_200;
const FORGIVENESS_COOLDOWN: u64 = 600;
const UNRESOLVED_TRUST: f32 = -0.05;
const ACCEPTANCE_TRUST: f32 = -0.45;
const ACCEPTANCE_ANGER: f32 = 0.65;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Outcome {
    Accepted,
    NotYet,
}

fn cooldown_key(other_id: &str) -> String {
    format!("ask_forgiveness:{other_id}")
}

fn recent_apology_tick(
    actor: &crate::organism::organism::Organism,
    listener_id: &str,
    tick: u64,
) -> Option<u64> {
    actor.life_log.iter().rev().find_map(|entry| {
        let age = tick.saturating_sub(entry.tick);
        (entry.category == "reconciliation"
            && entry.related_id.as_deref() == Some(listener_id)
            && entry.text.starts_with("apologized to ")
            && (APOLOGY_MIN_AGE..=APOLOGY_MAX_AGE).contains(&age))
        .then_some(entry.tick)
    })
}

fn pair_ready(sim: &Simulation, actor_idx: usize, listener_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let listener = &sim.organisms[listener_idx];
    actor
        .last_think_by_kind
        .get(&cooldown_key(&listener.id))
        .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= FORGIVENESS_COOLDOWN)
        && listener
            .last_think_by_kind
            .get(&cooldown_key(&actor.id))
            .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= FORGIVENESS_COOLDOWN)
}

fn choose_listener(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive || actor.regret < MIN_REGRET {
        return None;
    }
    nearby
        .iter()
        .copied()
        .filter_map(|listener_idx| {
            if listener_idx == actor_idx {
                return None;
            }
            let listener = &sim.organisms[listener_idx];
            let trust = listener.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            if !listener.alive
                || trust >= UNRESOLVED_TRUST
                || !pair_ready(sim, actor_idx, listener_idx)
                || (listener.x - actor.x).abs() + (listener.y - actor.y).abs() > 6.0
            {
                return None;
            }
            recent_apology_tick(actor, &listener.id, sim.tick_count)
                .map(|apology_tick| (listener_idx, apology_tick, trust))
        })
        .max_by(
            |(left_idx, left_tick, left_trust), (right_idx, right_tick, right_trust)| {
                left_tick
                    .cmp(right_tick)
                    .then_with(|| right_trust.total_cmp(left_trust))
                    .then_with(|| sim.organisms[*right_idx].id.cmp(&sim.organisms[*left_idx].id))
            },
        )
        .map(|(listener_idx, _, _)| listener_idx)
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_listener(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(listener_idx) = choose_listener(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("forgiveness needs remorse, time, and a real unresolved apology");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let listener_id = ctx.sim.organisms[listener_idx].id.clone();
    let listener_name = ctx.sim.organisms[listener_idx].name.clone();
    let listener_lineage = ctx.sim.organisms[listener_idx].lineage_id.clone();
    let listener_trust = ctx.sim.organisms[listener_idx]
        .org_trust
        .get(&actor_id)
        .copied()
        .unwrap_or(0.0);
    let outcome =
        if listener_trust >= ACCEPTANCE_TRUST && ctx.sim.organisms[listener_idx].anger <= ACCEPTANCE_ANGER {
            Outcome::Accepted
        } else {
            Outcome::NotYet
        };

    ctx.sim.organisms[ctx.idx]
        .last_think_by_kind
        .insert(cooldown_key(&listener_id), ctx.tick);
    ctx.sim.organisms[listener_idx]
        .last_think_by_kind
        .insert(cooldown_key(&actor_id), ctx.tick);

    match outcome {
        Outcome::Accepted => {
            {
                let actor = &mut ctx.sim.organisms[ctx.idx];
                actor.regret = (actor.regret - 0.08).max(0.0);
                actor.comfort = (actor.comfort + 0.08).min(1.0);
                actor.hope = (actor.hope + 0.07).min(1.0);
                let trust = actor.org_trust.entry(listener_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.06).min(1.0);
                if actor_lineage != listener_lineage {
                    actor.update_attitude(&listener_lineage, 0.02);
                }
                actor.log_life_rel(
                    ctx.tick,
                    "forgiveness",
                    format!("{listener_name} accepted my request for forgiveness"),
                    Some(listener_id.clone()),
                    Some(listener_name.clone()),
                );
            }
            {
                let listener = &mut ctx.sim.organisms[listener_idx];
                let trust = listener.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.18).min(1.0);
                listener.anger = (listener.anger - 0.18).max(0.0);
                listener.comfort = (listener.comfort + 0.05).min(1.0);
                if actor_lineage != listener_lineage {
                    listener.update_attitude(&actor_lineage, 0.03);
                }
                listener.think(&format!("choosing to forgive {actor_name}"), ctx.tick);
                listener.log_life_rel(
                    ctx.tick,
                    "forgiveness",
                    format!("accepted {actor_name}'s request for forgiveness"),
                    Some(actor_id.clone()),
                    Some(actor_name.clone()),
                );
            }
            ctx.think(&format!("grateful that {listener_name} forgave me"));
            ctx.event(
                "bond",
                &format!("was forgiven by {listener_name} after making amends"),
            );
            0.016
        }
        Outcome::NotYet => {
            {
                let actor = &mut ctx.sim.organisms[ctx.idx];
                actor.regret = (actor.regret + 0.05).min(1.0);
                actor.comfort = (actor.comfort - 0.04).max(0.0);
                actor.hope = (actor.hope - 0.025).max(0.0);
                actor.log_life_rel(
                    ctx.tick,
                    "forgiveness",
                    format!("{listener_name} was not ready to forgive me"),
                    Some(listener_id.clone()),
                    Some(listener_name.clone()),
                );
            }
            {
                let listener = &mut ctx.sim.organisms[listener_idx];
                let trust = listener.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.02).min(1.0);
                listener.anger = (listener.anger - 0.04).max(0.0);
                listener.think(&format!("not ready to forgive {actor_name}"), ctx.tick);
                listener.log_life_rel(
                    ctx.tick,
                    "forgiveness",
                    format!("told {actor_name} I was not ready to forgive"),
                    Some(actor_id.clone()),
                    Some(actor_name.clone()),
                );
            }
            ctx.think(&format!("hearing that {listener_name} needs more time"));
            ctx.event(
                "drama",
                &format!("asked {listener_name} for forgiveness, but the hurt remained"),
            );
            0.003
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn forgiveness_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0xF067_1E55);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let unrelated = 1;
        let listener = 2;
        for (index, x) in [(actor, 80.0), (unrelated, 81.0), (listener, 82.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 80.0;
        }
        sim.organisms[actor].regret = 0.30;
        sim.tick_count = 2_000;
        (sim, actor, unrelated, listener)
    }

    fn record_apology(sim: &mut Simulation, actor: usize, listener: usize, tick: u64) {
        let listener_id = sim.organisms[listener].id.clone();
        let listener_name = sim.organisms[listener].name.clone();
        sim.organisms[actor].log_life_rel(
            tick,
            "reconciliation",
            format!("apologized to {listener_name}"),
            Some(listener_id),
            Some(listener_name),
        );
    }

    #[test]
    fn action_requires_a_real_apology_and_time_for_it_to_settle() {
        let (mut sim, actor, _, listener) = forgiveness_world();
        let actor_id = sim.organisms[actor].id.clone();
        sim.organisms[listener].org_trust.insert(actor_id, -0.30);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 80, 80, &spatial).contains(&238));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 238, 80, 80, &spatial),
            None
        );

        let apology_tick = sim.tick_count;
        record_apology(&mut sim, actor, listener, apology_tick);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 80, 80, &spatial).contains(&238));
        sim.tick_count += APOLOGY_MIN_AGE;
        assert!(crate::sim::actions::available_actions(&sim, actor, 80, 80, &spatial).contains(&238));
    }

    #[test]
    fn severe_hurt_can_refuse_forgiveness_without_erasing_the_damage() {
        let (mut sim, actor, unrelated, listener) = forgiveness_world();
        let actor_id = sim.organisms[actor].id.clone();
        let listener_id = sim.organisms[listener].id.clone();
        sim.organisms[unrelated].alive = false;
        sim.organisms[listener].org_trust.insert(actor_id.clone(), -0.70);
        sim.organisms[listener].anger = 0.80;
        record_apology(&mut sim, actor, listener, 1_800);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 238, 80, 80, &spatial),
            Some(0.003)
        );
        assert!((sim.organisms[listener].org_trust[&actor_id] + 0.68).abs() < f32::EPSILON);
        assert!(sim.organisms[actor].regret > 0.30);
        assert!(sim.organisms[actor].life_log.iter().any(|entry| {
            entry.category == "forgiveness"
                && entry.related_id.as_deref() == Some(listener_id.as_str())
                && entry.text.contains("not ready")
        }));
    }

    #[test]
    fn earned_forgiveness_repairs_the_actual_relationship_and_persists() {
        let (mut sim, actor, unrelated, listener) = forgiveness_world();
        let actor_id = sim.organisms[actor].id.clone();
        let listener_id = sim.organisms[listener].id.clone();
        sim.organisms[unrelated].org_trust.insert(actor_id.clone(), -0.20);
        sim.organisms[listener].org_trust.insert(actor_id.clone(), -0.40);
        sim.organisms[listener].anger = 0.40;
        record_apology(&mut sim, actor, listener, 1_850);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 238, 80, 80, &spatial),
            Some(0.016)
        );
        assert!((sim.organisms[listener].org_trust[&actor_id] + 0.22).abs() < f32::EPSILON);
        assert_eq!(sim.organisms[unrelated].org_trust[&actor_id], -0.20);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_listener = loaded.organisms.iter().find(|o| o.id == listener_id).unwrap();
        assert!((loaded_listener.org_trust[&actor_id] + 0.22).abs() < f32::EPSILON);
        assert!(loaded_listener
            .life_log
            .iter()
            .any(|entry| { entry.category == "forgiveness" && entry.text.starts_with("accepted ") }));
    }

    #[test]
    fn shared_cooldown_persists_and_reopens_at_the_exact_boundary() {
        let (mut sim, actor, unrelated, listener) = forgiveness_world();
        sim.organisms[unrelated].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let listener_id = sim.organisms[listener].id.clone();
        sim.organisms[listener].org_trust.insert(actor_id.clone(), -0.70);
        sim.organisms[listener].regret = 0.30;
        sim.organisms[actor].org_trust.insert(listener_id.clone(), -0.30);
        record_apology(&mut sim, actor, listener, 1_800);
        record_apology(&mut sim, listener, actor, 1_800);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, listener, 82, 80, &spatial).contains(&238));
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 238, 80, 80, &spatial).is_some());

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded.organisms.iter().position(|o| o.id == actor_id).unwrap();
        let loaded_listener = loaded.organisms.iter().position(|o| o.id == listener_id).unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_actor, 80, 80, &spatial).contains(&238)
        );
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_listener, 82, 80, &spatial)
                .contains(&238)
        );
        loaded.tick_count += FORGIVENESS_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_actor, 80, 80, &spatial).contains(&238)
        );
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_listener, 82, 80, &spatial).contains(&238)
        );
    }

    #[test]
    fn cross_lineage_forgiveness_softens_both_group_attitudes() {
        let (mut sim, actor, unrelated, listener) = forgiveness_world();
        sim.organisms[unrelated].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let listener_lineage = "reconciling-neighbors".to_string();
        sim.organisms[listener].lineage_id.clone_from(&listener_lineage);
        sim.organisms[listener].org_trust.insert(actor_id, -0.30);
        record_apology(&mut sim, actor, listener, 1_850);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 238, 80, 80, &spatial).is_some());
        assert!(sim.organisms[actor].attitude_toward(&listener_lineage) > 0.0);
        assert!(sim.organisms[listener].attitude_toward(&actor_lineage) > 0.0);
    }
}
