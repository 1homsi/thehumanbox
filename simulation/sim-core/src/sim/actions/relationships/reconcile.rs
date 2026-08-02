use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::Organism,
    sim::{simulation::Simulation, spatial::SpatialIndex, warfare::has_active_battle_between},
};

const RECONCILIATION_COOLDOWN: u64 = 360;
const DISTRUST_THRESHOLD: f32 = -0.08;
const HOSTILE_ATTITUDE_THRESHOLD: f32 = -0.15;

fn recently_reconciled(person: &Organism, other_id: &str, tick: u64) -> bool {
    person.life_log.iter().rev().any(|entry| {
        entry.category == "reconciliation_pact"
            && entry.related_id.as_deref() == Some(other_id)
            && tick.saturating_sub(entry.tick) < RECONCILIATION_COOLDOWN
    })
}

fn conflict_score(sim: &Simulation, actor_idx: usize, target_idx: usize) -> Option<f32> {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_trust = actor.org_trust.get(&target.id).copied().unwrap_or(0.0);
    let target_trust = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    let cross_lineage = actor.lineage_id != target.lineage_id;
    let actor_attitude = if cross_lineage {
        actor.attitude_toward(&target.lineage_id)
    } else {
        0.0
    };
    let target_attitude = if cross_lineage {
        target.attitude_toward(&actor.lineage_id)
    } else {
        0.0
    };
    let has_conflict = actor_trust < DISTRUST_THRESHOLD
        || target_trust < DISTRUST_THRESHOLD
        || actor_attitude < HOSTILE_ATTITUDE_THRESHOLD
        || target_attitude < HOSTILE_ATTITUDE_THRESHOLD;
    has_conflict.then_some(
        actor_trust.min(0.0) + target_trust.min(0.0) + actor_attitude.min(0.0) + target_attitude.min(0.0),
    )
}

fn can_meet_directly(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    actor.anger < 0.75
        && target.anger < 0.85
        && !recently_reconciled(actor, &target.id, sim.tick_count)
        && !recently_reconciled(target, &actor.id, sim.tick_count)
        && !has_active_battle_between(&sim.battles, &actor.lineage_id, &target.lineage_id)
}

fn choose_target(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    nearby
        .iter()
        .copied()
        .filter_map(|target_idx| {
            if target_idx == actor_idx {
                return None;
            }
            let target = &sim.organisms[target_idx];
            if !target.alive
                || (target.x - actor.x).abs() + (target.y - actor.y).abs() > 6.0
                || !can_meet_directly(sim, actor_idx, target_idx)
            {
                return None;
            }
            conflict_score(sim, actor_idx, target_idx).map(|score| (target_idx, score))
        })
        .min_by(|(left_idx, left_score), (right_idx, right_score)| {
            let left = &sim.organisms[*left_idx];
            let right = &sim.organisms[*right_idx];
            let left_distance = (left.x - actor.x).abs() + (left.y - actor.y).abs();
            let right_distance = (right.x - actor.x).abs() + (right.y - actor.y).abs();
            left_score
                .total_cmp(right_score)
                .then_with(|| left_distance.total_cmp(&right_distance))
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|(target_idx, _)| target_idx)
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
        ctx.think("no cooled conflict is ready for reconciliation");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let target_id = ctx.sim.organisms[target_idx].id.clone();
    let target_name = ctx.sim.organisms[target_idx].name.clone();
    let target_lineage = ctx.sim.organisms[target_idx].lineage_id.clone();
    let actor_trust_before = ctx.sim.organisms[ctx.idx]
        .org_trust
        .get(&target_id)
        .copied()
        .unwrap_or(0.0);
    let target_trust_before = ctx.sim.organisms[target_idx]
        .org_trust
        .get(&actor_id)
        .copied()
        .unwrap_or(0.0);

    // Deep distrust needs several meetings. A reconciliation repairs damage,
    // but cannot jump straight from hostility to friendship.
    let actor_repair = if actor_trust_before <= -0.50 { 0.08 } else { 0.14 };
    let target_repair = if target_trust_before <= -0.50 { 0.08 } else { 0.14 };
    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
        *trust = (*trust + actor_repair).min(0.35);
        actor.anger = (actor.anger - 0.18).max(0.0);
        actor.regret = (actor.regret - 0.12).max(0.0);
        actor.fear_level = (actor.fear_level - 0.05).max(0.0);
        actor.comfort = (actor.comfort + 0.05).min(1.0);
        if actor_lineage != target_lineage {
            actor.update_attitude(&target_lineage, 0.05);
        }
        actor.log_life_rel(
            ctx.tick,
            "reconciliation_pact",
            format!("met {target_name} directly and agreed to rebuild trust"),
            Some(target_id.clone()),
            Some(target_name.clone()),
        );
    }
    {
        let target = &mut ctx.sim.organisms[target_idx];
        let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + target_repair).min(0.35);
        target.anger = (target.anger - 0.18).max(0.0);
        target.regret = (target.regret - 0.12).max(0.0);
        target.fear_level = (target.fear_level - 0.05).max(0.0);
        target.comfort = (target.comfort + 0.05).min(1.0);
        if actor_lineage != target_lineage {
            target.update_attitude(&actor_lineage, 0.05);
        }
        target.think(&format!("reconciling directly with {actor_name}"), ctx.tick);
        target.log_life_rel(
            ctx.tick,
            "reconciliation_pact",
            format!("met {actor_name} directly and agreed to rebuild trust"),
            Some(actor_id),
            Some(actor_name.clone()),
        );
    }

    ctx.think(&format!("reconciling with {target_name}"));
    ctx.event(
        "reconciliation",
        &format!("{actor_name} and {target_name} agreed to rebuild trust"),
    );
    0.016
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::warfare::{Battle, BattleScale};

    fn reconciliation_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0x0EC0_2340);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let calm = 1;
        let rival = 2;
        for (index, x) in [(actor, 50.0), (calm, 51.0), (rival, 52.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 50.0;
        }
        sim.tick_count = 1_500;
        (sim, actor, calm, rival)
    }

    #[test]
    fn direct_reconciliation_repairs_both_sides_and_persists() {
        let (mut sim, actor, calm, rival) = reconciliation_world();
        let actor_id = sim.organisms[actor].id.clone();
        let rival_id = sim.organisms[rival].id.clone();
        sim.organisms[actor].org_trust.insert(rival_id.clone(), -0.40);
        sim.organisms[rival].org_trust.insert(actor_id.clone(), -0.30);
        sim.organisms[actor].anger = 0.50;
        sim.organisms[rival].anger = 0.60;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 234, 50, 50, &spatial).is_some());
        assert_eq!(sim.organisms[calm].org_trust.get(&actor_id), None);
        assert!((sim.organisms[actor].org_trust[&rival_id] + 0.26).abs() < f32::EPSILON);
        assert!((sim.organisms[rival].org_trust[&actor_id] + 0.16).abs() < f32::EPSILON);
        assert!(sim.organisms[actor].anger < 0.50);
        assert!(sim.organisms[rival].anger < 0.60);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        assert!((loaded_actor.org_trust[&rival_id] + 0.26).abs() < f32::EPSILON);
        assert!(loaded_actor.life_log.iter().any(|entry| {
            entry.category == "reconciliation_pact" && entry.related_id.as_deref() == Some(&rival_id)
        }));
    }

    #[test]
    fn action_requires_conflict_calm_participants_and_obeys_pair_cooldown() {
        let (mut sim, actor, calm, rival) = reconciliation_world();
        sim.organisms[calm].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let rival_id = sim.organisms[rival].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&234));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 234, 50, 50, &spatial),
            None
        );

        sim.organisms[actor].org_trust.insert(rival_id.clone(), -0.30);
        sim.organisms[rival].org_trust.insert(actor_id, -0.20);
        sim.organisms[rival].anger = 0.90;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&234));

        sim.organisms[rival].anger = 0.40;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 234, 50, 50, &spatial).is_some());
        assert!(!crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&234));

        sim.tick_count += RECONCILIATION_COOLDOWN;
        assert!(crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&234));
    }

    #[test]
    fn active_battle_blocks_cross_lineage_reconciliation_without_mutation() {
        let (mut sim, actor, calm, rival) = reconciliation_world();
        sim.organisms[calm].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let rival_id = sim.organisms[rival].id.clone();
        sim.organisms[actor].lineage_id = "river".into();
        sim.organisms[rival].lineage_id = "hill".into();
        sim.organisms[actor].org_trust.insert(rival_id.clone(), -0.40);
        sim.organisms[rival].org_trust.insert(actor_id, -0.40);
        sim.battles.push(Battle {
            id: "active-river-hill".into(),
            attackers: vec!["river".into()],
            defenders: vec!["hill".into()],
            attacker_orgs: vec![sim.organisms[actor].id.clone()],
            defender_orgs: vec![sim.organisms[rival].id.clone()],
            scale: BattleScale::Skirmish,
            location: (50, 50),
            started_tick: 1_400,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 1,
            initial_d: 1,
        });
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&234));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 234, 50, 50, &spatial),
            None
        );
        assert_eq!(sim.organisms[actor].org_trust[&rival_id], -0.40);
    }

    #[test]
    fn cross_lineage_reconciliation_repairs_group_attitudes_both_ways() {
        let (mut sim, actor, calm, rival) = reconciliation_world();
        sim.organisms[calm].alive = false;
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let rival_lineage = "neighbor-lineage".to_string();
        sim.organisms[rival].lineage_id.clone_from(&rival_lineage);
        sim.organisms[actor]
            .lineage_attitudes
            .insert(rival_lineage.clone(), -0.45);
        sim.organisms[rival]
            .lineage_attitudes
            .insert(actor_lineage.clone(), -0.35);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 50, 50, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[actor].attitude_toward(&rival_lineage) > -0.45);
        assert!(sim.organisms[rival].attitude_toward(&actor_lineage) > -0.35);
    }
}
