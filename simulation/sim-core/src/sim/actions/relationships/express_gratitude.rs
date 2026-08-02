use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::LifeEvent,
    sim::{simulation::Simulation, spatial::SpatialIndex},
};

const MIN_GRATITUDE: f32 = 0.18;
const GRATITUDE_COST: f32 = 0.18;
const SUPPORT_MEMORY_WINDOW: u64 = 1_200;
const GRATITUDE_COOLDOWN: u64 = 240;

fn cooldown_key(helper_id: &str) -> String {
    format!("express_gratitude:{helper_id}")
}

fn is_received_support(entry: &LifeEvent) -> bool {
    match entry.category.as_str() {
        "gift" => entry.text.contains("received "),
        "help" => entry.text.contains("when I asked for help"),
        "protection" => entry.text.contains("promised to keep me safe") || entry.text.contains("shielded me"),
        "mentorship" => entry.text.starts_with("learned "),
        "support" => entry.text.contains("stayed close through grief"),
        // Sharing a physical burden is intentionally reciprocal: both people did real work.
        "cooperation" => true,
        _ => false,
    }
}

fn choose_helper(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive || actor.gratitude < MIN_GRATITUDE {
        return None;
    }

    actor.life_log.iter().rev().find_map(|entry| {
        if sim.tick_count.saturating_sub(entry.tick) > SUPPORT_MEMORY_WINDOW || !is_received_support(entry) {
            return None;
        }
        let helper_id = entry.related_id.as_deref()?;
        if actor
            .last_think_by_kind
            .get(&cooldown_key(helper_id))
            .is_some_and(|last| sim.tick_count.saturating_sub(*last) < GRATITUDE_COOLDOWN)
        {
            return None;
        }
        nearby.iter().copied().find(|&index| {
            let helper = &sim.organisms[index];
            index != actor_idx
                && helper.alive
                && helper.id == helper_id
                && (helper.x - actor.x).abs() + (helper.y - actor.y).abs() <= 6.0
        })
    })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_helper(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(helper_idx) = choose_helper(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("remembering kindness, but its giver is not here");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let helper_id = ctx.sim.organisms[helper_idx].id.clone();
    let helper_name = ctx.sim.organisms[helper_idx].name.clone();
    let helper_lineage = ctx.sim.organisms[helper_idx].lineage_id.clone();

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        actor
            .last_think_by_kind
            .insert(cooldown_key(&helper_id), ctx.tick);
        actor.gratitude = (actor.gratitude - GRATITUDE_COST).max(0.0);
        actor.comfort = (actor.comfort + 0.06).min(1.0);
        actor.hope = (actor.hope + 0.04).min(1.0);
        let trust = actor.org_trust.entry(helper_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.07).min(1.0);
        if actor_lineage != helper_lineage {
            actor.update_attitude(&helper_lineage, 0.025);
        }
        actor.log_life_rel(
            ctx.tick,
            "gratitude",
            format!("thanked {helper_name} for being there"),
            Some(helper_id.clone()),
            Some(helper_name.clone()),
        );
    }
    {
        let helper = &mut ctx.sim.organisms[helper_idx];
        helper.comfort = (helper.comfort + 0.09).min(1.0);
        helper.hope = (helper.hope + 0.05).min(1.0);
        helper.joy_ticks = helper.joy_ticks.saturating_add(90).min(1_200);
        let trust = helper.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.05).min(1.0);
        if actor_lineage != helper_lineage {
            helper.update_attitude(&actor_lineage, 0.02);
        }
        helper.think(&format!("appreciated by {actor_name}"), ctx.tick);
        helper.log_life_rel(
            ctx.tick,
            "gratitude",
            format!("{actor_name} thanked me for helping"),
            Some(actor_id),
            Some(actor_name),
        );
    }

    ctx.think(&format!("thanking {helper_name}"));
    ctx.event(
        "bond",
        &format!("thanked {helper_name} for their recent kindness"),
    );
    0.012
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gratitude_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0x6A47_170D);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let bystander = 1;
        let helper = 2;
        for (index, x) in [(actor, 50.0), (bystander, 51.0), (helper, 52.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 50.0;
        }
        sim.organisms[actor].gratitude = 0.60;
        sim.tick_count = 2_000;
        (sim, actor, bystander, helper)
    }

    fn record_received_gift(sim: &mut Simulation, actor: usize, helper: usize, tick: u64) {
        let helper_id = sim.organisms[helper].id.clone();
        let helper_name = sim.organisms[helper].name.clone();
        sim.organisms[actor].log_life_rel(
            tick,
            "gift",
            format!("received food from {helper_name}"),
            Some(helper_id),
            Some(helper_name),
        );
    }

    #[test]
    fn gratitude_targets_the_actual_helper_and_persists_reciprocal_bond() {
        let (mut sim, actor, bystander, helper) = gratitude_world();
        let actor_id = sim.organisms[actor].id.clone();
        let helper_id = sim.organisms[helper].id.clone();
        record_received_gift(&mut sim, actor, helper, 1_990);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 228, 50, 50, &spatial).is_some());

        assert!((sim.organisms[actor].gratitude - 0.42).abs() < f32::EPSILON);
        assert_eq!(sim.organisms[actor].org_trust.get(&helper_id), Some(&0.07));
        assert_eq!(sim.organisms[helper].org_trust.get(&actor_id), Some(&0.05));
        assert!(sim.organisms[bystander].org_trust.is_empty());
        assert!(sim.organisms[helper].joy_ticks >= 90);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        assert_eq!(loaded_actor.org_trust.get(&helper_id), Some(&0.07));
        assert!(loaded_actor
            .life_log
            .iter()
            .any(|entry| entry.category == "gratitude" && entry.related_id.as_deref() == Some(&helper_id)));
    }

    #[test]
    fn newest_received_support_wins_over_nearby_order() {
        let (mut sim, actor, older_helper, newest_helper) = gratitude_world();
        let newest_id = sim.organisms[newest_helper].id.clone();
        record_received_gift(&mut sim, actor, older_helper, 1_980);
        record_received_gift(&mut sim, actor, newest_helper, 1_995);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 228, 50, 50, &spatial).is_some());
        assert_eq!(sim.organisms[actor].org_trust.get(&newest_id), Some(&0.07));
        assert!(!sim.organisms[actor]
            .org_trust
            .contains_key(&sim.organisms[older_helper].id));
    }

    #[test]
    fn outgoing_or_stale_kindness_does_not_enable_gratitude() {
        let (mut sim, actor, _, helper) = gratitude_world();
        let helper_id = sim.organisms[helper].id.clone();
        let helper_name = sim.organisms[helper].name.clone();
        sim.organisms[actor].log_life_rel(
            1_999,
            "gift",
            format!("gave food to hungry {helper_name}"),
            Some(helper_id),
            Some(helper_name),
        );
        record_received_gift(&mut sim, actor, helper, 799);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&228));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 228, 50, 50, &spatial),
            None
        );
    }

    #[test]
    fn gratitude_threshold_and_pair_cooldown_are_enforced_at_execution() {
        let (mut sim, actor, _, helper) = gratitude_world();
        record_received_gift(&mut sim, actor, helper, 1_995);
        sim.organisms[actor].gratitude = MIN_GRATITUDE - 0.01;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 228, 50, 50, &spatial),
            None
        );

        sim.organisms[actor].gratitude = 0.60;
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 228, 50, 50, &spatial).is_some());
        sim.organisms[actor].gratitude = 0.60;
        assert!(!crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&228));
        sim.tick_count += GRATITUDE_COOLDOWN;
        assert!(crate::sim::actions::available_actions(&sim, actor, 50, 50, &spatial).contains(&228));
    }

    #[test]
    fn cross_lineage_gratitude_improves_both_attitudes() {
        let (mut sim, actor, bystander, helper) = gratitude_world();
        sim.organisms[bystander].alive = false;
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let helper_lineage = "helpful-neighbors".to_string();
        sim.organisms[helper].lineage_id.clone_from(&helper_lineage);
        record_received_gift(&mut sim, actor, helper, 1_995);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 228, 50, 50, &spatial).is_some());
        assert!(sim.organisms[actor].attitude_toward(&helper_lineage) > 0.0);
        assert!(sim.organisms[helper].attitude_toward(&actor_lineage) > 0.0);
    }
}
