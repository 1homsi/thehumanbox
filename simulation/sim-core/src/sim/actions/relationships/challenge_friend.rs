use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::Organism,
    sim::{age_stage::AgeStage, simulation::Simulation, spatial::SpatialIndex},
};

const FRIENDLY_CHALLENGE_COOLDOWN: u64 = 240;
const FRIENDLY_CHALLENGE_KEY: &str = "friendly_challenge";

fn challenge_ready(organism: &Organism, tick: u64) -> bool {
    organism
        .last_think_by_kind
        .get(FRIENDLY_CHALLENGE_KEY)
        .is_none_or(|last| tick.saturating_sub(*last) >= FRIENDLY_CHALLENGE_COOLDOWN)
}

fn can_compete(organism: &Organism, tick: u64) -> bool {
    organism.alive
        && !matches!(organism.age_stage(), AgeStage::Infant)
        && !organism.pregnant
        && organism.health >= 0.70
        && organism.energy >= 0.58
        && organism.hydration >= 0.50
        && challenge_ready(organism, tick)
}

fn is_friendly_rival(sim: &Simulation, actor_idx: usize, rival_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let rival = &sim.organisms[rival_idx];
    actor.partner_id.as_deref() == Some(rival.id.as_str())
        || actor.friends.contains_key(&rival.id)
        || rival.friends.contains_key(&actor.id)
        || (actor.lineage_id == rival.lineage_id
            && actor.org_trust.get(&rival.id).copied().unwrap_or(0.0) >= 0.25)
        || (actor.lineage_id != rival.lineage_id
            && actor.org_trust.get(&rival.id).copied().unwrap_or(0.0) >= 0.55
            && rival.org_trust.get(&actor.id).copied().unwrap_or(0.0) >= 0.55)
}

fn contest_score(organism: &Organism) -> f32 {
    let training = match organism.specialty.as_deref() {
        Some("officer") => 0.14,
        Some("soldier") => 0.12,
        Some("hunter") => 0.06,
        _ => 0.0,
    };
    organism.traits.resilience * 0.30
        + organism.traits.aggression * 0.20
        + (1.0 - organism.traits.fear) * 0.15
        + organism.health * 0.15
        + organism.energy * 0.10
        + organism.hydration * 0.10
        + training
}

fn choose_rival(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    if !can_compete(actor, sim.tick_count) {
        return None;
    }
    let actor_score = contest_score(actor);
    nearby
        .iter()
        .copied()
        .filter(|&rival_idx| {
            rival_idx != actor_idx
                && can_compete(&sim.organisms[rival_idx], sim.tick_count)
                && is_friendly_rival(sim, actor_idx, rival_idx)
                && (sim.organisms[rival_idx].x - actor.x).abs() + (sim.organisms[rival_idx].y - actor.y).abs()
                    <= 6.0
        })
        .min_by(|&left, &right| {
            let left_rival = &sim.organisms[left];
            let right_rival = &sim.organisms[right];
            let left_gap = (contest_score(left_rival) - actor_score).abs();
            let right_gap = (contest_score(right_rival) - actor_score).abs();
            let left_distance = (left_rival.x - actor.x).abs() + (left_rival.y - actor.y).abs();
            let right_distance = (right_rival.x - actor.x).abs() + (right_rival.y - actor.y).abs();
            left_gap
                .total_cmp(&right_gap)
                .then_with(|| left_distance.total_cmp(&right_distance))
                .then_with(|| left_rival.id.cmp(&right_rival.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_rival(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(rival_idx) = choose_rival(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no rested friend is ready for a fair challenge");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let rival_id = ctx.sim.organisms[rival_idx].id.clone();
    let rival_name = ctx.sim.organisms[rival_idx].name.clone();
    let rival_lineage = ctx.sim.organisms[rival_idx].lineage_id.clone();
    let actor_score = contest_score(&ctx.sim.organisms[ctx.idx]);
    let rival_score = contest_score(&ctx.sim.organisms[rival_idx]);
    let actor_won = actor_score > rival_score || (actor_score == rival_score && actor_id < rival_id);
    let (winner_idx, loser_idx, winner_name, loser_name) = if actor_won {
        (ctx.idx, rival_idx, actor_name.clone(), rival_name.clone())
    } else {
        (rival_idx, ctx.idx, rival_name.clone(), actor_name.clone())
    };

    // This is an unarmed friendly contest. It consumes stamina rather than
    // creating it, and it never changes health or uses weapon multipliers.
    ctx.sim.organisms[ctx.idx].energy = (ctx.sim.organisms[ctx.idx].energy - 0.12).max(0.0);
    ctx.sim.organisms[rival_idx].energy = (ctx.sim.organisms[rival_idx].energy - 0.10).max(0.0);
    ctx.sim.organisms[ctx.idx].boredom = (ctx.sim.organisms[ctx.idx].boredom - 0.16).max(0.0);
    ctx.sim.organisms[rival_idx].boredom = (ctx.sim.organisms[rival_idx].boredom - 0.16).max(0.0);
    ctx.sim.organisms[ctx.idx].last_challenged = ctx.tick;
    ctx.sim.organisms[rival_idx].last_challenged = ctx.tick;
    ctx.sim.organisms[ctx.idx]
        .last_think_by_kind
        .insert(FRIENDLY_CHALLENGE_KEY.into(), ctx.tick);
    ctx.sim.organisms[rival_idx]
        .last_think_by_kind
        .insert(FRIENDLY_CHALLENGE_KEY.into(), ctx.tick);

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(rival_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.045).min(1.0);
        actor.comfort = (actor.comfort + 0.035).min(1.0);
        if actor_lineage != rival_lineage {
            actor.update_attitude(&rival_lineage, 0.02);
        }
        actor.log_life_rel(
            ctx.tick,
            "friendly_challenge",
            if actor_won {
                format!("won a friendly contest against {rival_name}")
            } else {
                format!("lost a close friendly contest to {rival_name}")
            },
            Some(rival_id.clone()),
            Some(rival_name.clone()),
        );
    }
    {
        let rival = &mut ctx.sim.organisms[rival_idx];
        let trust = rival.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.045).min(1.0);
        rival.comfort = (rival.comfort + 0.035).min(1.0);
        if actor_lineage != rival_lineage {
            rival.update_attitude(&actor_lineage, 0.02);
        }
        rival.think(&format!("friendly contest with {actor_name}"), ctx.tick);
        rival.log_life_rel(
            ctx.tick,
            "friendly_challenge",
            if actor_won {
                format!("lost a close friendly contest to {actor_name}")
            } else {
                format!("won a friendly contest against {actor_name}")
            },
            Some(actor_id.clone()),
            Some(actor_name.clone()),
        );
    }

    ctx.sim.organisms[winner_idx].hope = (ctx.sim.organisms[winner_idx].hope + 0.05).min(1.0);
    ctx.sim.organisms[winner_idx].joy_ticks = ctx.sim.organisms[winner_idx]
        .joy_ticks
        .saturating_add(90)
        .min(1_200);
    ctx.sim.organisms[winner_idx]
        .attributes
        .insert("proven-competitor".into());
    ctx.sim.organisms[loser_idx].hope = (ctx.sim.organisms[loser_idx].hope + 0.015).min(1.0);
    ctx.sim.organisms[winner_idx].add_anchor(
        ctx.tick,
        format!("won a friendly contest against {loser_name}"),
        0.45,
    );
    ctx.sim.organisms[loser_idx].add_anchor(ctx.tick, format!("tested myself against {winner_name}"), 0.30);
    ctx.sim.history.challenges_total = ctx.sim.history.challenges_total.saturating_add(1);

    ctx.think(&format!("friendly contest with {rival_name}"));
    ctx.event(
        "challenge",
        &format!("{winner_name} won a friendly contest against {loser_name}"),
    );
    if actor_won {
        0.014
    } else {
        0.010
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn challenge_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0xF21E_2420);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let rival = 1;
        let distant_skill_mismatch = 2;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 90.0), (rival, 91.0), (distant_skill_mismatch, 94.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 90.0;
            sim.organisms[index].age = sim.organisms[index].max_age / 2;
            sim.organisms[index].health = 0.90;
            sim.organisms[index].energy = 0.85;
            sim.organisms[index].hydration = 0.85;
        }
        let rival_id = sim.organisms[rival].id.clone();
        let mismatch_id = sim.organisms[distant_skill_mismatch].id.clone();
        sim.organisms[actor].friends.insert(rival_id, "Rival".into());
        sim.organisms[actor]
            .friends
            .insert(mismatch_id, "Mismatch".into());
        sim.organisms[actor].traits.resilience = 0.90;
        sim.organisms[actor].traits.aggression = 0.80;
        sim.organisms[actor].traits.fear = 0.10;
        sim.organisms[rival].traits.resilience = 0.55;
        sim.organisms[rival].traits.aggression = 0.50;
        sim.organisms[rival].traits.fear = 0.45;
        sim.organisms[distant_skill_mismatch].traits.resilience = 0.10;
        sim.organisms[distant_skill_mismatch].traits.aggression = 0.10;
        sim.organisms[distant_skill_mismatch].traits.fear = 0.90;
        sim.tick_count = 1_000;
        (sim, actor, rival, distant_skill_mismatch)
    }

    #[test]
    fn contest_selects_a_fair_rival_costs_energy_and_records_a_winner() {
        let (mut sim, actor, rival, mismatch) = challenge_world();
        let actor_id = sim.organisms[actor].id.clone();
        let rival_id = sim.organisms[rival].id.clone();
        let actor_energy = sim.organisms[actor].energy;
        let rival_energy = sim.organisms[rival].energy;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 242, 90, 90, &spatial).is_some());
        assert!(sim.organisms[actor].energy < actor_energy);
        assert!(sim.organisms[rival].energy < rival_energy);
        assert_eq!(sim.organisms[mismatch].last_challenged, 0);
        assert_eq!(sim.organisms[actor].last_challenged, 1_000);
        assert_eq!(sim.organisms[rival].last_challenged, 1_000);
        assert!(sim.organisms[actor].attributes.contains("proven-competitor"));
        assert_eq!(sim.history.challenges_total, 1);
        assert_eq!(sim.organisms[rival].org_trust.get(&actor_id), Some(&0.045));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        assert_eq!(loaded_actor.last_challenged, 1_000);
        assert_eq!(
            loaded_actor.last_think_by_kind.get(FRIENDLY_CHALLENGE_KEY),
            Some(&1_000)
        );
        assert!(loaded_actor.attributes.contains("proven-competitor"));
        assert!(loaded_actor.life_log.iter().any(|entry| {
            entry.category == "friendly_challenge" && entry.related_id.as_deref() == Some(&rival_id)
        }));
    }

    #[test]
    fn action_requires_a_real_bond_and_fit_participants() {
        let (mut sim, actor, rival, mismatch) = challenge_world();
        sim.organisms[mismatch].alive = false;
        sim.organisms[actor].friends.clear();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 90, 90, &spatial).contains(&242));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 242, 90, 90, &spatial),
            None
        );

        let rival_id = sim.organisms[rival].id.clone();
        sim.organisms[actor].friends.insert(rival_id, "Rival".into());
        sim.organisms[rival].energy = 0.30;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 90, 90, &spatial).contains(&242));
    }

    #[test]
    fn both_participants_share_a_persisted_cooldown_with_an_exact_boundary() {
        let (mut sim, actor, rival, mismatch) = challenge_world();
        sim.organisms[mismatch].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 242, 90, 90, &spatial).is_some());
        assert!(!crate::sim::actions::available_actions(&sim, actor, 90, 90, &spatial).contains(&242));
        assert!(!crate::sim::actions::available_actions(&sim, rival, 91, 90, &spatial).contains(&242));

        sim.tick_count += FRIENDLY_CHALLENGE_COOLDOWN;
        assert!(crate::sim::actions::available_actions(&sim, actor, 90, 90, &spatial).contains(&242));
    }

    #[test]
    fn trusted_cross_lineage_friends_compete_without_hostility() {
        let (mut sim, actor, rival, mismatch) = challenge_world();
        sim.organisms[mismatch].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let rival_id = sim.organisms[rival].id.clone();
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let rival_lineage = "friendly-neighbor".to_string();
        sim.organisms[rival].lineage_id.clone_from(&rival_lineage);
        sim.organisms[actor].org_trust.insert(rival_id, 0.60);
        sim.organisms[rival].org_trust.insert(actor_id, 0.60);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 90, 90, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[actor].attitude_toward(&rival_lineage) > 0.0);
        assert!(sim.organisms[rival].attitude_toward(&actor_lineage) > 0.0);
        assert!(sim.organisms[actor].health >= 0.90);
        assert!(sim.organisms[rival].health >= 0.90);
    }
}
