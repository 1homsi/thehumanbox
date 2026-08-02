use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const COMPANIONSHIP_COOLDOWN: u64 = 180;
const MIN_ACTOR_ENERGY: f32 = 0.25;

fn cooldown_key(other_id: &str) -> String {
    format!("silent_companionship:{other_id}")
}

fn pair_ready(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    actor
        .last_think_by_kind
        .get(&cooldown_key(&target.id))
        .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= COMPANIONSHIP_COOLDOWN)
        && target
            .last_think_by_kind
            .get(&cooldown_key(&actor.id))
            .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= COMPANIONSHIP_COOLDOWN)
}

fn is_close_bond(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    if actor.lineage_id == target.lineage_id
        || actor.partner_id.as_deref() == Some(target.id.as_str())
        || actor.friends.contains_key(&target.id)
    {
        return true;
    }
    actor.org_trust.get(&target.id).copied().unwrap_or(0.0) >= 0.45
        && target.org_trust.get(&actor.id).copied().unwrap_or(0.0) >= 0.25
}

fn distress_score(sim: &Simulation, actor_idx: usize, target_idx: usize) -> Option<f32> {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let needs_presence = target.loneliness >= 0.25
        || target.fear_level >= 0.35
        || target.comfort <= 0.40
        || target.boredom >= 0.65
        || target.grief_ticks > 0;
    if !needs_presence {
        return None;
    }
    let partner_bonus = (actor.partner_id.as_deref() == Some(target.id.as_str())) as u8 as f32 * 0.25;
    Some(
        target.loneliness * 1.8
            + target.fear_level
            + (1.0 - target.comfort) * 0.7
            + target.boredom * 0.5
            + target.grief_ticks.min(400) as f32 / 500.0
            + partner_bonus,
    )
}

fn choose_target(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive || actor.energy < MIN_ACTOR_ENERGY {
        return None;
    }
    nearby
        .iter()
        .copied()
        .filter_map(|target_idx| {
            if target_idx == actor_idx {
                return None;
            }
            let target = &sim.organisms[target_idx];
            if !target.alive
                || !is_close_bond(sim, actor_idx, target_idx)
                || !pair_ready(sim, actor_idx, target_idx)
                || (target.x - actor.x).abs() + (target.y - actor.y).abs() > 6.0
            {
                return None;
            }
            distress_score(sim, actor_idx, target_idx).map(|score| (target_idx, score))
        })
        .max_by(|(left_idx, left_score), (right_idx, right_score)| {
            left_score
                .total_cmp(right_score)
                .then_with(|| sim.organisms[*right_idx].id.cmp(&sim.organisms[*left_idx].id))
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
        ctx.think("no loved one nearby needs quiet company");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let target_id = ctx.sim.organisms[target_idx].id.clone();
    let target_name = ctx.sim.organisms[target_idx].name.clone();
    let target_lineage = ctx.sim.organisms[target_idx].lineage_id.clone();
    let partner = ctx.sim.organisms[ctx.idx].partner_id.as_deref() == Some(target_id.as_str());
    let loneliness_relief = if partner { 0.22 } else { 0.16 };
    let grief_relief = if partner { 35 } else { 20 };

    ctx.sim.organisms[ctx.idx]
        .last_think_by_kind
        .insert(cooldown_key(&target_id), ctx.tick);
    ctx.sim.organisms[target_idx]
        .last_think_by_kind
        .insert(cooldown_key(&actor_id), ctx.tick);
    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        actor.comfort = (actor.comfort + 0.05).min(1.0);
        actor.loneliness = (actor.loneliness - 0.07).max(0.0);
        actor.boredom = (actor.boredom - 0.06).max(0.0);
        let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        if actor_lineage != target_lineage {
            actor.update_attitude(&target_lineage, 0.015);
        }
        actor.log_life_rel(
            ctx.tick,
            "companionship",
            format!("sat quietly beside {target_name}"),
            Some(target_id.clone()),
            Some(target_name.clone()),
        );
    }
    {
        let target = &mut ctx.sim.organisms[target_idx];
        target.comfort = (target.comfort + 0.12).min(1.0);
        target.loneliness = (target.loneliness - loneliness_relief).max(0.0);
        target.fear_level = (target.fear_level - 0.08).max(0.0);
        target.boredom = (target.boredom - 0.10).max(0.0);
        target.grief_ticks = target.grief_ticks.saturating_sub(grief_relief);
        target.joy_ticks = target.joy_ticks.saturating_add(50).min(1_200);
        let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.07).min(1.0);
        if actor_lineage != target_lineage {
            target.update_attitude(&actor_lineage, 0.02);
        }
        target.think(&format!("{actor_name} stayed beside me"), ctx.tick);
        target.log_life_rel(
            ctx.tick,
            "companionship",
            format!("{actor_name} stayed quietly beside me"),
            Some(actor_id),
            Some(actor_name),
        );
    }

    ctx.think(&format!("sitting quietly with {target_name}"));
    ctx.event(
        "bond",
        &format!("kept {target_name} company through a difficult moment"),
    );
    if partner {
        0.012
    } else {
        0.009
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn companionship_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0x511E_07C0);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let comfortable = 1;
        let distressed = 2;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 70.0), (comfortable, 71.0), (distressed, 72.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 70.0;
            sim.organisms[index].energy = 0.80;
            sim.organisms[index].comfort = 0.80;
            sim.organisms[index].boredom = 0.10;
        }
        sim.organisms[distressed].comfort = 0.20;
        sim.organisms[distressed].loneliness = 0.75;
        sim.organisms[distressed].fear_level = 0.50;
        sim.organisms[distressed].grief_ticks = 100;
        sim.tick_count = 5_000;
        (sim, actor, comfortable, distressed)
    }

    #[test]
    fn companionship_targets_distress_and_persists_reciprocal_care() {
        let (mut sim, actor, comfortable, distressed) = companionship_world();
        let actor_id = sim.organisms[actor].id.clone();
        let distressed_id = sim.organisms[distressed].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 241, 70, 70, &spatial).is_some());

        assert!(sim.organisms[distressed].loneliness < 0.75);
        assert!(sim.organisms[distressed].fear_level < 0.50);
        assert_eq!(sim.organisms[distressed].grief_ticks, 80);
        assert_eq!(sim.organisms[actor].org_trust.get(&distressed_id), Some(&0.04));
        assert_eq!(sim.organisms[distressed].org_trust.get(&actor_id), Some(&0.07));
        assert!(sim.organisms[comfortable].org_trust.is_empty());

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_target = loaded.organisms.iter().find(|o| o.id == distressed_id).unwrap();
        assert_eq!(loaded_target.org_trust.get(&actor_id), Some(&0.07));
        assert!(loaded_target
            .life_log
            .iter()
            .any(|entry| entry.category == "companionship"));
    }

    #[test]
    fn action_is_hidden_and_rejected_when_nobody_needs_company() {
        let (mut sim, actor, _, distressed) = companionship_world();
        sim.organisms[distressed].comfort = 0.80;
        sim.organisms[distressed].loneliness = 0.10;
        sim.organisms[distressed].fear_level = 0.10;
        sim.organisms[distressed].boredom = 0.10;
        sim.organisms[distressed].grief_ticks = 0;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, actor, 70, 70, &spatial).contains(&241));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 241, 70, 70, &spatial),
            None
        );
    }

    #[test]
    fn shared_pair_cooldown_persists_and_reopens_at_the_boundary() {
        let (mut sim, actor, comfortable, distressed) = companionship_world();
        sim.organisms[comfortable].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let distressed_id = sim.organisms[distressed].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 241, 70, 70, &spatial).is_some());

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded.organisms.iter().position(|o| o.id == actor_id).unwrap();
        let loaded_target = loaded
            .organisms
            .iter()
            .position(|o| o.id == distressed_id)
            .unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_actor, 70, 70, &spatial).contains(&241)
        );
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_target, 72, 70, &spatial).contains(&241)
        );

        loaded.tick_count += COMPANIONSHIP_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_actor, 70, 70, &spatial).contains(&241)
        );
    }

    #[test]
    fn mutually_trusted_foreign_friend_can_receive_companionship() {
        let (mut sim, actor, comfortable, distressed) = companionship_world();
        sim.organisms[comfortable].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let distressed_id = sim.organisms[distressed].id.clone();
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let target_lineage = "foreign-friends".to_string();
        sim.organisms[distressed].lineage_id.clone_from(&target_lineage);
        sim.organisms[actor].org_trust.insert(distressed_id, 0.50);
        sim.organisms[distressed].org_trust.insert(actor_id, 0.30);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 241, 70, 70, &spatial).is_some());
        assert!(sim.organisms[actor].attitude_toward(&target_lineage) > 0.0);
        assert!(sim.organisms[distressed].attitude_toward(&actor_lineage) > 0.0);
    }
}
