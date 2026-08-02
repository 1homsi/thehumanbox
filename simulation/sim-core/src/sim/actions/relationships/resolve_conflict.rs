use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const MEDIATION_COOLDOWN: u64 = 240;

fn recently_mediated_by(person: &crate::organism::organism::Organism, mediator_id: &str, tick: u64) -> bool {
    person.life_log.iter().rev().any(|entry| {
        entry.category == "mediation"
            && entry.related_id.as_deref() == Some(mediator_id)
            && tick.saturating_sub(entry.tick) < MEDIATION_COOLDOWN
    })
}

fn conflict_score(sim: &Simulation, left: usize, right: usize) -> Option<f32> {
    let left_org = &sim.organisms[left];
    let right_org = &sim.organisms[right];
    let left_trust = left_org.org_trust.get(&right_org.id).copied().unwrap_or(0.0);
    let right_trust = right_org.org_trust.get(&left_org.id).copied().unwrap_or(0.0);
    let left_attitude = left_org.attitude_toward(&right_org.lineage_id);
    let right_attitude = right_org.attitude_toward(&left_org.lineage_id);
    let is_conflict = left_trust < -0.05
        || right_trust < -0.05
        || (left_org.lineage_id != right_org.lineage_id && (left_attitude < -0.15 || right_attitude < -0.15));
    is_conflict.then_some(
        left_trust.min(0.0) + right_trust.min(0.0) + left_attitude.min(0.0) + right_attitude.min(0.0),
    )
}

fn choose_conflict_pair(sim: &Simulation, mediator_idx: usize, nearby: &[usize]) -> Option<(usize, usize)> {
    let mediator = &sim.organisms[mediator_idx];
    let mut best: Option<(usize, usize, f32, f32)> = None;
    for (position, &left) in nearby.iter().enumerate() {
        if left == mediator_idx || !sim.organisms[left].alive {
            continue;
        }
        for &right in &nearby[position + 1..] {
            if right == mediator_idx || right == left || !sim.organisms[right].alive {
                continue;
            }
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            if (left_org.x - mediator.x).abs() + (left_org.y - mediator.y).abs() > 6.0
                || (right_org.x - mediator.x).abs() + (right_org.y - mediator.y).abs() > 6.0
                || (recently_mediated_by(left_org, &mediator.id, sim.tick_count)
                    && recently_mediated_by(right_org, &mediator.id, sim.tick_count))
            {
                continue;
            }
            let Some(score) = conflict_score(sim, left, right) else {
                continue;
            };
            let distance = (left_org.x - right_org.x).abs() + (left_org.y - right_org.y).abs();
            let replace = best.is_none_or(|(best_left, best_right, best_score, best_distance)| {
                score < best_score
                    || (score == best_score && distance < best_distance)
                    || (score == best_score
                        && distance == best_distance
                        && (left_org.id.as_str(), right_org.id.as_str())
                            < (
                                sim.organisms[best_left].id.as_str(),
                                sim.organisms[best_right].id.as_str(),
                            ))
            });
            if replace {
                best = Some((left, right, score, distance));
            }
        }
    }
    best.map(|(left, right, _, _)| (left, right))
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, mediator_idx: usize, nearby: &[usize]) -> bool {
    choose_conflict_pair(sim, mediator_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, mediator_idx: usize, spatial: &SpatialIndex) -> bool {
    let mediator = &sim.organisms[mediator_idx];
    let nearby = spatial.query(mediator.x as i32, mediator.y as i32, 6);
    can_apply_with_nearby(sim, mediator_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((left_idx, right_idx)) = choose_conflict_pair(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no active conflict to mediate");
        return 0.0;
    };

    let mediator_id = ctx.sim.organisms[ctx.idx].id.clone();
    let mediator_name = ctx.sim.organisms[ctx.idx].name.clone();
    let left_id = ctx.sim.organisms[left_idx].id.clone();
    let left_name = ctx.sim.organisms[left_idx].name.clone();
    let left_lineage = ctx.sim.organisms[left_idx].lineage_id.clone();
    let right_id = ctx.sim.organisms[right_idx].id.clone();
    let right_name = ctx.sim.organisms[right_idx].name.clone();
    let right_lineage = ctx.sim.organisms[right_idx].lineage_id.clone();

    {
        let left = &mut ctx.sim.organisms[left_idx];
        let trust = left.org_trust.entry(right_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.12).min(1.0);
        let mediator_trust = left.org_trust.entry(mediator_id.clone()).or_insert(0.0);
        *mediator_trust = (*mediator_trust + 0.06).min(1.0);
        left.anger = (left.anger - 0.16).max(0.0);
        left.comfort = (left.comfort + 0.04).min(1.0);
        if left_lineage != right_lineage {
            left.update_attitude(&right_lineage, 0.05);
        }
        left.think(&format!("hearing {right_name} through {mediator_name}"), ctx.tick);
        left.log_life_rel(
            ctx.tick,
            "mediation",
            format!("{mediator_name} mediated a conflict with {right_name}"),
            Some(mediator_id.clone()),
            Some(mediator_name.clone()),
        );
    }
    {
        let right = &mut ctx.sim.organisms[right_idx];
        let trust = right.org_trust.entry(left_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.12).min(1.0);
        let mediator_trust = right.org_trust.entry(mediator_id.clone()).or_insert(0.0);
        *mediator_trust = (*mediator_trust + 0.06).min(1.0);
        right.anger = (right.anger - 0.16).max(0.0);
        right.comfort = (right.comfort + 0.04).min(1.0);
        if left_lineage != right_lineage {
            right.update_attitude(&left_lineage, 0.05);
        }
        right.think(&format!("hearing {left_name} through {mediator_name}"), ctx.tick);
        right.log_life_rel(
            ctx.tick,
            "mediation",
            format!("{mediator_name} mediated a conflict with {left_name}"),
            Some(mediator_id.clone()),
            Some(mediator_name.clone()),
        );
    }
    {
        let mediator = &mut ctx.sim.organisms[ctx.idx];
        let left_trust = mediator.org_trust.entry(left_id.clone()).or_insert(0.0);
        *left_trust = (*left_trust + 0.025).min(1.0);
        let right_trust = mediator.org_trust.entry(right_id.clone()).or_insert(0.0);
        *right_trust = (*right_trust + 0.025).min(1.0);
        mediator.comfort = (mediator.comfort + 0.05).min(1.0);
        mediator.hope = (mediator.hope + 0.04).min(1.0);
        mediator.log_life_rel(
            ctx.tick,
            "mediation",
            format!("helped {left_name} and {right_name} face their conflict"),
            Some(left_id),
            Some(left_name.clone()),
        );
    }

    ctx.think(&format!("mediating {left_name} and {right_name}"));
    ctx.discover(
        "conflict_resolution",
        &format!("mediated a real conflict between {left_name} and {right_name}"),
    );
    ctx.event(
        "social",
        &format!("helped {left_name} and {right_name} make peace"),
    );
    0.018
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mediation_world() -> (Simulation, usize, usize, usize, usize) {
        let mut sim = Simulation::new(0x0C0F_11C7);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let mediator = 0;
        let calm = 1;
        let left = 2;
        let right = 3;
        for (index, x) in [(mediator, 60.0), (calm, 61.0), (left, 62.0), (right, 63.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 60.0;
        }
        sim.tick_count = 2_000;
        (sim, mediator, calm, left, right)
    }

    #[test]
    fn mediation_repairs_the_most_hostile_pair_and_persists() {
        let (mut sim, mediator, calm, left, right) = mediation_world();
        let mediator_id = sim.organisms[mediator].id.clone();
        let left_id = sim.organisms[left].id.clone();
        let right_id = sim.organisms[right].id.clone();
        sim.organisms[left].org_trust.insert(right_id.clone(), -0.55);
        sim.organisms[right].org_trust.insert(left_id.clone(), -0.45);
        sim.organisms[left].anger = 0.70;
        sim.organisms[right].anger = 0.60;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, mediator, 60, 60, &spatial);

        assert!(apply(&mut ctx) > 0.0);

        assert!((sim.organisms[left].org_trust[&right_id] + 0.43).abs() < f32::EPSILON);
        assert!((sim.organisms[right].org_trust[&left_id] + 0.33).abs() < f32::EPSILON);
        assert_eq!(sim.organisms[calm].org_trust.get(&mediator_id), None);
        assert_eq!(sim.organisms[left].org_trust[&mediator_id], 0.06);
        assert!(sim.organisms[left].anger < 0.70);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_left = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == left_id)
            .unwrap();
        assert!((loaded_left.org_trust[&right_id] + 0.43).abs() < f32::EPSILON);
        assert!(loaded_left
            .life_log
            .iter()
            .any(|entry| entry.category == "mediation"));
    }

    #[test]
    fn action_requires_a_real_conflict_and_cools_down_for_that_pair() {
        let (mut sim, mediator, calm, left, right) = mediation_world();
        sim.organisms[calm].alive = false;
        let left_id = sim.organisms[left].id.clone();
        let right_id = sim.organisms[right].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, mediator, 60, 60, &spatial).contains(&245));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, mediator, 245, 60, 60, &spatial),
            None
        );

        sim.organisms[left].org_trust.insert(right_id, -0.40);
        sim.organisms[right].org_trust.insert(left_id, -0.40);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, mediator, 60, 60, &spatial).contains(&245));
        assert!(crate::sim::actions::try_apply(&mut sim, mediator, 245, 60, 60, &spatial).is_some());

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, mediator, 60, 60, &spatial).contains(&245));
        sim.tick_count += MEDIATION_COOLDOWN;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::available_actions(&sim, mediator, 60, 60, &spatial).contains(&245));
    }

    #[test]
    fn mediation_repairs_cross_lineage_attitudes_in_both_directions() {
        let (mut sim, mediator, calm, left, right) = mediation_world();
        sim.organisms[calm].alive = false;
        let left_lineage = sim.organisms[left].lineage_id.clone();
        let right_lineage = "rival-lineage".to_string();
        sim.organisms[right].lineage_id.clone_from(&right_lineage);
        sim.organisms[left]
            .lineage_attitudes
            .insert(right_lineage.clone(), -0.50);
        sim.organisms[right]
            .lineage_attitudes
            .insert(left_lineage.clone(), -0.40);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, mediator, 60, 60, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[left].attitude_toward(&right_lineage) > -0.50);
        assert!(sim.organisms[right].attitude_toward(&left_lineage) > -0.40);
    }
}
