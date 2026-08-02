use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const LOVE_COOLDOWN: u64 = 240;
const CONFLICT_TRUST: f32 = -0.08;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LoveKind {
    Partner,
    Courtship,
}

fn cooldown_key(other_id: &str) -> String {
    format!("express_love:{other_id}")
}

fn pair_ready(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_key = cooldown_key(&target.id);
    let target_key = cooldown_key(&actor.id);
    actor
        .last_think_by_kind
        .get(&actor_key)
        .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= LOVE_COOLDOWN)
        && target
            .last_think_by_kind
            .get(&target_key)
            .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= LOVE_COOLDOWN)
}

fn relationship_kind(sim: &Simulation, actor_idx: usize, target_idx: usize) -> Option<LoveKind> {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_trust = actor.org_trust.get(&target.id).copied().unwrap_or(0.0);
    let target_trust = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    if actor_trust <= CONFLICT_TRUST
        || target_trust <= CONFLICT_TRUST
        || actor.anger >= 0.75
        || target.anger >= 0.75
    {
        return None;
    }

    let reciprocal_partners = actor.partner_id.as_deref() == Some(target.id.as_str())
        && target.partner_id.as_deref() == Some(actor.id.as_str());
    if reciprocal_partners {
        return Some(LoveKind::Partner);
    }

    let mutual_courtship = actor.partner_id.is_none()
        && target.partner_id.is_none()
        && actor.age > 1_000
        && target.age > 1_000
        && actor.attracted_to.as_deref() == Some(target.id.as_str())
        && target.attracted_to.as_deref() == Some(actor.id.as_str())
        && actor.attitude_toward(&target.lineage_id) > -0.30
        && target.attitude_toward(&actor.lineage_id) > -0.30;
    mutual_courtship.then_some(LoveKind::Courtship)
}

fn choose_target(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<(usize, LoveKind)> {
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
                || !pair_ready(sim, actor_idx, target_idx)
            {
                return None;
            }
            relationship_kind(sim, actor_idx, target_idx).map(|kind| (target_idx, kind))
        })
        .max_by(|(left_idx, left_kind), (right_idx, right_kind)| {
            let left = &sim.organisms[*left_idx];
            let right = &sim.organisms[*right_idx];
            let left_partner = *left_kind == LoveKind::Partner;
            let right_partner = *right_kind == LoveKind::Partner;
            left_partner
                .cmp(&right_partner)
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
    let Some((target_idx, kind)) = choose_target(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("love needs a nearby mutual bond without unresolved hurt");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let target_id = ctx.sim.organisms[target_idx].id.clone();
    let target_name = ctx.sim.organisms[target_idx].name.clone();
    let target_lineage = ctx.sim.organisms[target_idx].lineage_id.clone();
    let (trust_gain, comfort_gain, loneliness_relief, joy_gain, category) = match kind {
        LoveKind::Partner => (0.08, 0.10, 0.18, 160, "love"),
        LoveKind::Courtship => (0.05, 0.06, 0.10, 90, "courtship"),
    };

    ctx.sim.organisms[ctx.idx]
        .last_think_by_kind
        .insert(cooldown_key(&target_id), ctx.tick);
    ctx.sim.organisms[target_idx]
        .last_think_by_kind
        .insert(cooldown_key(&actor_id), ctx.tick);
    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
        *trust = (*trust + trust_gain).min(1.0);
        actor.comfort = (actor.comfort + comfort_gain).min(1.0);
        actor.loneliness = (actor.loneliness - loneliness_relief).max(0.0);
        actor.boredom = (actor.boredom - 0.08).max(0.0);
        actor.hope = (actor.hope + 0.05).min(1.0);
        actor.joy_ticks = actor.joy_ticks.saturating_add(joy_gain).min(1_200);
        if kind == LoveKind::Partner {
            actor.jealousy = (actor.jealousy - 0.15).max(0.0);
        }
        if actor_lineage != target_lineage {
            actor.update_attitude(&target_lineage, 0.025);
        }
        actor.log_life_rel(
            ctx.tick,
            category,
            match kind {
                LoveKind::Partner => format!("shared a loving moment with {target_name}"),
                LoveKind::Courtship => format!("openly expressed my feelings to {target_name}"),
            },
            Some(target_id.clone()),
            Some(target_name.clone()),
        );
    }
    {
        let target = &mut ctx.sim.organisms[target_idx];
        let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + trust_gain).min(1.0);
        target.comfort = (target.comfort + comfort_gain).min(1.0);
        target.loneliness = (target.loneliness - loneliness_relief).max(0.0);
        target.boredom = (target.boredom - 0.08).max(0.0);
        target.hope = (target.hope + 0.05).min(1.0);
        target.joy_ticks = target.joy_ticks.saturating_add(joy_gain).min(1_200);
        if kind == LoveKind::Partner {
            target.jealousy = (target.jealousy - 0.15).max(0.0);
        }
        if actor_lineage != target_lineage {
            target.update_attitude(&actor_lineage, 0.025);
        }
        target.think(&format!("sharing affection with {actor_name}"), ctx.tick);
        target.log_life_rel(
            ctx.tick,
            category,
            match kind {
                LoveKind::Partner => format!("shared a loving moment with {actor_name}"),
                LoveKind::Courtship => format!("heard {actor_name} openly express their feelings"),
            },
            Some(actor_id.clone()),
            Some(actor_name.clone()),
        );
    }

    ctx.think(&format!("expressing love to {target_name}"));
    let event_detail = match kind {
        LoveKind::Partner => format!("shared an affectionate moment with {target_name}"),
        LoveKind::Courtship => format!("openly expressed feelings to {target_name}"),
    };
    ctx.event(category, &event_detail);
    if kind == LoveKind::Partner {
        0.016
    } else {
        0.012
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn love_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0x10AE_2440);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let partner = 1;
        let unrelated_kin = 2;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 60.0), (partner, 61.0), (unrelated_kin, 62.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 60.0;
            sim.organisms[index].age = 2_000;
        }
        let actor_id = sim.organisms[actor].id.clone();
        let partner_id = sim.organisms[partner].id.clone();
        sim.organisms[actor].partner_id = Some(partner_id);
        sim.organisms[partner].partner_id = Some(actor_id);
        sim.organisms[actor].loneliness = 0.70;
        sim.organisms[partner].loneliness = 0.60;
        sim.organisms[actor].jealousy = 0.50;
        sim.organisms[partner].jealousy = 0.40;
        sim.tick_count = 1_200;
        (sim, actor, partner, unrelated_kin)
    }

    #[test]
    fn partner_love_targets_the_real_partner_and_reassures_both_people() {
        let (mut sim, actor, partner, unrelated) = love_world();
        let actor_id = sim.organisms[actor].id.clone();
        let partner_id = sim.organisms[partner].id.clone();
        let unrelated_comfort = sim.organisms[unrelated].comfort;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 244, 60, 60, &spatial).is_some());
        assert_eq!(sim.organisms[unrelated].comfort, unrelated_comfort);
        assert_eq!(sim.organisms[actor].org_trust.get(&partner_id), Some(&0.08));
        assert_eq!(sim.organisms[partner].org_trust.get(&actor_id), Some(&0.08));
        assert!(sim.organisms[actor].loneliness < 0.70);
        assert!(sim.organisms[partner].loneliness < 0.60);
        assert!(sim.organisms[actor].jealousy < 0.50);
        assert!(sim.organisms[partner].jealousy < 0.40);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        assert_eq!(loaded_actor.org_trust.get(&partner_id), Some(&0.08));
        assert!(loaded_actor
            .life_log
            .iter()
            .any(|entry| { entry.category == "love" && entry.related_id.as_deref() == Some(&partner_id) }));
    }

    #[test]
    fn mutual_courtship_deepens_without_skipping_partnership_progression() {
        let (mut sim, actor, target, unrelated) = love_world();
        sim.organisms[unrelated].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let target_id = sim.organisms[target].id.clone();
        sim.organisms[actor].partner_id = None;
        sim.organisms[target].partner_id = None;
        sim.organisms[actor].attracted_to = Some(target_id.clone());
        sim.organisms[target].attracted_to = Some(actor_id.clone());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 60, 60, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert_eq!(sim.organisms[actor].partner_id, None);
        assert_eq!(sim.organisms[target].partner_id, None);
        assert_eq!(
            sim.organisms[actor].attracted_to.as_deref(),
            Some(target_id.as_str())
        );
        assert_eq!(
            sim.organisms[target].attracted_to.as_deref(),
            Some(actor_id.as_str())
        );
        assert_eq!(sim.organisms[actor].org_trust.get(&target_id), Some(&0.05));
    }

    #[test]
    fn unresolved_hurt_or_one_sided_relationship_hides_and_rejects_action() {
        let (mut sim, actor, partner, unrelated) = love_world();
        sim.organisms[unrelated].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        sim.organisms[partner].partner_id = None;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 60, 60, &spatial).contains(&244));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 244, 60, 60, &spatial),
            None
        );

        sim.organisms[partner].partner_id = Some(actor_id.clone());
        sim.organisms[partner].org_trust.insert(actor_id, -0.30);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 60, 60, &spatial).contains(&244));
    }

    #[test]
    fn pair_cooldown_is_shared_and_has_an_exact_boundary() {
        let (mut sim, actor, partner, unrelated) = love_world();
        sim.organisms[unrelated].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 244, 60, 60, &spatial).is_some());
        assert!(!crate::sim::actions::available_actions(&sim, actor, 60, 60, &spatial).contains(&244));
        assert!(!crate::sim::actions::available_actions(&sim, partner, 61, 60, &spatial).contains(&244));

        sim.tick_count += LOVE_COOLDOWN;
        assert!(crate::sim::actions::available_actions(&sim, actor, 60, 60, &spatial).contains(&244));
    }

    #[test]
    fn cross_lineage_partners_improve_attitudes_in_both_directions() {
        let (mut sim, actor, partner, unrelated) = love_world();
        sim.organisms[unrelated].alive = false;
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let partner_lineage = "partner-lineage".to_string();
        sim.organisms[partner].lineage_id.clone_from(&partner_lineage);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 60, 60, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[actor].attitude_toward(&partner_lineage) > 0.0);
        assert!(sim.organisms[partner].attitude_toward(&actor_lineage) > 0.0);
    }
}
