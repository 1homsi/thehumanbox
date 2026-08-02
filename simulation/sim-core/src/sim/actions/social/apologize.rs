use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const APOLOGY_COOLDOWN: u64 = 180;
const DISTRUST_THRESHOLD: f32 = -0.05;

fn recently_apologized(actor: &crate::organism::organism::Organism, listener_id: &str, tick: u64) -> bool {
    actor.life_log.iter().rev().any(|entry| {
        entry.category == "reconciliation"
            && entry.related_id.as_deref() == Some(listener_id)
            && tick.saturating_sub(entry.tick) < APOLOGY_COOLDOWN
    })
}

fn choose_listener(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    nearby
        .iter()
        .copied()
        .filter(|&index| {
            let listener = &sim.organisms[index];
            index != actor_idx
                && listener.alive
                && listener.org_trust.get(&actor.id).copied().unwrap_or(0.0) < DISTRUST_THRESHOLD
                && !recently_apologized(actor, &listener.id, sim.tick_count)
                && (listener.x - actor.x).abs() + (listener.y - actor.y).abs() <= 6.0
        })
        .min_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_trust = left_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let right_trust = right_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let left_distance = (left_org.x - actor.x).abs() + (left_org.y - actor.y).abs();
            let right_distance = (right_org.x - actor.x).abs() + (right_org.y - actor.y).abs();
            left_trust
                .total_cmp(&right_trust)
                .then_with(|| left_distance.total_cmp(&right_distance))
                .then_with(|| left_org.id.cmp(&right_org.id))
        })
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
        ctx.think("no unresolved hurt to apologize for");
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

    // Deeply damaged relationships take several sincere attempts to repair.
    // A mild rupture can be resolved in one, but forgiveness never creates a
    // friendship by itself.
    let forgiveness = if listener_trust <= -0.50 { 0.08 } else { 0.16 };
    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(listener_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        actor.regret = (actor.regret - 0.20).max(0.0);
        actor.comfort = (actor.comfort + 0.03).min(1.0);
        if actor_lineage != listener_lineage {
            actor.update_attitude(&listener_lineage, 0.015);
        }
        actor.log_life_rel(
            ctx.tick,
            "reconciliation",
            format!("apologized to {listener_name}"),
            Some(listener_id.clone()),
            Some(listener_name.clone()),
        );
    }
    {
        let listener = &mut ctx.sim.organisms[listener_idx];
        let trust = listener.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + forgiveness).min(1.0);
        listener.anger = (listener.anger - 0.18).max(0.0);
        listener.comfort = (listener.comfort + 0.025).min(1.0);
        if actor_lineage != listener_lineage {
            listener.update_attitude(&actor_lineage, 0.025);
        }
        listener.think(&format!("hearing {actor_name}'s apology"), ctx.tick);
        listener.log_life_rel(
            ctx.tick,
            "reconciliation",
            format!("heard an apology from {actor_name}"),
            Some(actor_id),
            Some(actor_name.clone()),
        );
    }

    ctx.think(&format!("apologizing to {listener_name}"));
    ctx.event("social", &format!("made amends with {listener_name}"));
    0.010
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apology_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0xA901_061E);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let mildly_hurt = 1;
        let deeply_hurt = 2;
        for (index, x) in [(actor, 80.0), (mildly_hurt, 81.0), (deeply_hurt, 82.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 80.0;
        }
        sim.tick_count = 1_000;
        (sim, actor, mildly_hurt, deeply_hurt)
    }

    #[test]
    fn apology_targets_the_most_damaged_relationship_and_persists() {
        let (mut sim, actor, mildly_hurt, deeply_hurt) = apology_world();
        let actor_id = sim.organisms[actor].id.clone();
        let deeply_hurt_id = sim.organisms[deeply_hurt].id.clone();
        sim.organisms[actor].regret = 0.45;
        sim.organisms[mildly_hurt]
            .org_trust
            .insert(actor_id.clone(), -0.10);
        sim.organisms[deeply_hurt]
            .org_trust
            .insert(actor_id.clone(), -0.60);
        sim.organisms[deeply_hurt].anger = 0.70;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 80, 80, &spatial);

        assert!(apply(&mut ctx) > 0.0);

        assert_eq!(sim.organisms[mildly_hurt].org_trust[&actor_id], -0.10);
        assert!((sim.organisms[deeply_hurt].org_trust[&actor_id] + 0.52).abs() < f32::EPSILON);
        assert!((sim.organisms[deeply_hurt].anger - 0.52).abs() < f32::EPSILON);
        assert!((sim.organisms[actor].regret - 0.25).abs() < f32::EPSILON);
        assert!(sim.organisms[actor]
            .life_log
            .iter()
            .any(|entry| entry.related_id.as_deref() == Some(&deeply_hurt_id)));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_listener = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == deeply_hurt_id)
            .unwrap();
        assert!((loaded_listener.org_trust[&actor_id] + 0.52).abs() < f32::EPSILON);
        assert!(loaded_listener
            .life_log
            .iter()
            .any(|entry| entry.category == "reconciliation"));
    }

    #[test]
    fn action_is_hidden_without_hurt_and_has_a_per_person_cooldown() {
        let (mut sim, actor, mildly_hurt, deeply_hurt) = apology_world();
        sim.organisms[deeply_hurt].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 80, 80, &spatial).contains(&86));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 86, 80, 80, &spatial),
            None
        );

        sim.organisms[mildly_hurt].org_trust.insert(actor_id, -0.25);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, actor, 80, 80, &spatial).contains(&86));
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 86, 80, 80, &spatial).is_some());

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 80, 80, &spatial).contains(&86));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 86, 80, 80, &spatial),
            None
        );

        sim.tick_count += APOLOGY_COOLDOWN;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, actor, 80, 80, &spatial).contains(&86));
    }

    #[test]
    fn cross_lineage_apology_softens_both_group_attitudes() {
        let (mut sim, actor, mildly_hurt, deeply_hurt) = apology_world();
        sim.organisms[deeply_hurt].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let listener_lineage = "neighbor-lineage".to_string();
        sim.organisms[mildly_hurt]
            .lineage_id
            .clone_from(&listener_lineage);
        sim.organisms[mildly_hurt].org_trust.insert(actor_id, -0.20);
        sim.organisms[actor]
            .lineage_attitudes
            .insert(listener_lineage.clone(), -0.30);
        sim.organisms[mildly_hurt]
            .lineage_attitudes
            .insert(actor_lineage.clone(), -0.40);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 80, 80, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[actor].attitude_toward(&listener_lineage) > -0.30);
        assert!(sim.organisms[mildly_hurt].attitude_toward(&actor_lineage) > -0.40);
    }
}
