use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::{LifeEvent, Organism},
    sim::{simulation::Simulation, spatial::SpatialIndex},
};

const ACHIEVEMENT_WINDOW: u64 = 1_800;
const ADMIRATION_COOLDOWN: u64 = 360;

#[derive(Clone, Debug, PartialEq, Eq)]
struct Achievement {
    tick: u64,
    score: u8,
    detail: String,
}

fn cooldown_key(target_id: &str) -> String {
    format!("express_admiration:{target_id}")
}

fn direct_achievement(entry: &LifeEvent) -> Option<Achievement> {
    let score = match entry.category.as_str() {
        "graduated" => 6,
        "achievement" | "milestone" => 5,
        "specialty" => 4,
        "discovery" => 3,
        "protection"
            if entry.text.starts_with("shielded ") || entry.text.starts_with("promised to guard ") =>
        {
            6
        }
        "mentorship" if entry.text.starts_with("mentored ") => 4,
        _ => return None,
    };
    Some(Achievement {
        tick: entry.tick,
        score,
        detail: entry.text.clone(),
    })
}

fn witnessed_achievement(entry: &LifeEvent, target_id: &str) -> Option<Achievement> {
    if entry.category != "witnessed" || entry.related_id.as_deref() != Some(target_id) {
        return None;
    }
    let score = if entry.text.contains("earned a degree") {
        6
    } else if entry.text.contains("take up a trade") || entry.text.contains("witnessed an age turn") {
        5
    } else if entry.text.contains("built")
        || entry.text.contains("taught")
        || entry.text.contains("gift")
        || entry.text.contains("noticed ")
    {
        4
    } else {
        return None;
    };
    Some(Achievement {
        tick: entry.tick,
        score,
        detail: entry.text.clone(),
    })
}

fn latest_achievement(actor: &Organism, target: &Organism, tick: u64) -> Option<Achievement> {
    let direct = target
        .life_log
        .iter()
        .rev()
        .filter(|entry| tick.saturating_sub(entry.tick) <= ACHIEVEMENT_WINDOW)
        .filter_map(direct_achievement);
    let witnessed = actor
        .life_log
        .iter()
        .rev()
        .filter(|entry| tick.saturating_sub(entry.tick) <= ACHIEVEMENT_WINDOW)
        .filter_map(|entry| witnessed_achievement(entry, &target.id));
    direct.chain(witnessed).max_by(|left, right| {
        left.score
            .cmp(&right.score)
            .then_with(|| left.tick.cmp(&right.tick))
            .then_with(|| right.detail.cmp(&left.detail))
    })
}

fn choose_target(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<(usize, Achievement)> {
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
                || actor
                    .last_think_by_kind
                    .get(&cooldown_key(&target.id))
                    .is_some_and(|last| sim.tick_count.saturating_sub(*last) < ADMIRATION_COOLDOWN)
            {
                return None;
            }
            latest_achievement(actor, target, sim.tick_count).map(|achievement| (target_idx, achievement))
        })
        .max_by(|(left_idx, left), (right_idx, right)| {
            left.score
                .cmp(&right.score)
                .then_with(|| left.tick.cmp(&right.tick))
                .then_with(|| sim.organisms[*right_idx].id.cmp(&sim.organisms[*left_idx].id))
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
    let Some((target_idx, achievement)) = choose_target(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no nearby achievement calls for praise");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let target_id = ctx.sim.organisms[target_idx].id.clone();
    let target_name = ctx.sim.organisms[target_idx].name.clone();
    let target_lineage = ctx.sim.organisms[target_idx].lineage_id.clone();

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        actor
            .last_think_by_kind
            .insert(cooldown_key(&target_id), ctx.tick);
        actor.comfort = (actor.comfort + 0.035).min(1.0);
        actor.curiosity_drive = (actor.curiosity_drive + 0.03).min(1.0);
        let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.06).min(1.0);
        if actor_lineage != target_lineage {
            actor.update_attitude(&target_lineage, 0.02);
        }
        actor.log_life_rel(
            ctx.tick,
            "admiration",
            format!("praised {target_name} for {}", achievement.detail),
            Some(target_id.clone()),
            Some(target_name.clone()),
        );
    }
    {
        let target = &mut ctx.sim.organisms[target_idx];
        target.comfort = (target.comfort + 0.09).min(1.0);
        target.hope = (target.hope + 0.07).min(1.0);
        target.gratitude = (target.gratitude + 0.04).min(1.0);
        target.boredom = (target.boredom - 0.08).max(0.0);
        target.joy_ticks = target.joy_ticks.saturating_add(120).min(1_200);
        let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        if actor_lineage != target_lineage {
            target.update_attitude(&actor_lineage, 0.015);
        }
        target.think(&format!("{actor_name} noticed what I achieved"), ctx.tick);
        target.log_life_rel(
            ctx.tick,
            "admiration",
            format!("{actor_name} praised my achievement"),
            Some(actor_id),
            Some(actor_name),
        );
    }

    ctx.think(&format!("admiring {target_name}'s achievement"));
    ctx.event(
        "bond",
        &format!("praised {target_name} for {}", achievement.detail),
    );
    0.010 + achievement.score as f32 * 0.001
}

#[cfg(test)]
mod tests {
    use super::*;

    fn admiration_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0xADA1_7E01);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let ordinary = 1;
        let achiever = 2;
        for (index, x) in [(actor, 40.0), (ordinary, 41.0), (achiever, 42.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 40.0;
        }
        sim.tick_count = 3_000;
        (sim, actor, ordinary, achiever)
    }

    #[test]
    fn admiration_targets_the_real_achievement_and_persists_the_bond() {
        let (mut sim, actor, ordinary, achiever) = admiration_world();
        let actor_id = sim.organisms[actor].id.clone();
        let achiever_id = sim.organisms[achiever].id.clone();
        sim.organisms[achiever].log_life(2_990, "achievement", "became the elder of my people".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 237, 40, 40, &spatial).is_some());

        assert_eq!(sim.organisms[actor].org_trust.get(&achiever_id), Some(&0.06));
        assert_eq!(sim.organisms[achiever].org_trust.get(&actor_id), Some(&0.04));
        assert!(sim.organisms[ordinary].org_trust.is_empty());
        assert!(sim.organisms[achiever].joy_ticks >= 120);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        assert_eq!(loaded_actor.org_trust.get(&achiever_id), Some(&0.06));
        assert!(loaded_actor.life_log.iter().any(|entry| {
            entry.category == "admiration" && entry.related_id.as_deref() == Some(&achiever_id)
        }));
    }

    #[test]
    fn witnessed_degree_outranks_nearer_minor_discovery() {
        let (mut sim, actor, nearer, graduate) = admiration_world();
        let graduate_id = sim.organisms[graduate].id.clone();
        let graduate_name = sim.organisms[graduate].name.clone();
        sim.organisms[nearer].log_life(2_999, "discovery", "learned fire making".into());
        sim.organisms[actor].log_life_rel(
            2_980,
            "witnessed",
            format!("heard {graduate_name} earned a degree: medicine"),
            Some(graduate_id.clone()),
            Some(graduate_name),
        );
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 237, 40, 40, &spatial).is_some());
        assert_eq!(sim.organisms[actor].org_trust.get(&graduate_id), Some(&0.06));
        assert!(!sim.organisms[actor]
            .org_trust
            .contains_key(&sim.organisms[nearer].id));
    }

    #[test]
    fn stale_or_unrelated_history_hides_and_rejects_action() {
        let (mut sim, actor, _, achiever) = admiration_world();
        sim.organisms[achiever].log_life(1_199, "milestone", "claimed a new home".into());
        sim.organisms[actor].log_life(2_999, "witnessed", "watched rain cross the valley".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, actor, 40, 40, &spatial).contains(&237));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 237, 40, 40, &spatial),
            None
        );
    }

    #[test]
    fn admiration_cooldown_persists_and_has_an_exact_boundary() {
        let (mut sim, actor, ordinary, achiever) = admiration_world();
        sim.organisms[ordinary].alive = false;
        sim.organisms[achiever].log_life(2_990, "milestone", "claimed my own ground".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 237, 40, 40, &spatial).is_some());

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .position(|o| o.id == sim.organisms[actor].id)
            .unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_actor, 40, 40, &spatial).contains(&237)
        );

        let mut loaded = loaded;
        loaded.tick_count += ADMIRATION_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_actor, 40, 40, &spatial).contains(&237)
        );
    }

    #[test]
    fn cross_lineage_admiration_improves_attitudes_both_ways() {
        let (mut sim, actor, ordinary, achiever) = admiration_world();
        sim.organisms[ordinary].alive = false;
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let achiever_lineage = "neighbor-artisans".to_string();
        sim.organisms[achiever].lineage_id.clone_from(&achiever_lineage);
        sim.organisms[achiever].log_life(2_990, "specialty", "became a smith".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 237, 40, 40, &spatial).is_some());
        assert!(sim.organisms[actor].attitude_toward(&achiever_lineage) > 0.0);
        assert!(sim.organisms[achiever].attitude_toward(&actor_lineage) > 0.0);
    }
}
