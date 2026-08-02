use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::{LifeEvent, Organism},
    sim::{simulation::Simulation, spatial::SpatialIndex},
};

const MISCONDUCT_WINDOW: u64 = 900;
const MIN_ENERGY: f32 = 0.25;
const ENERGY_COST: f32 = 0.02;

#[derive(Clone, Debug, PartialEq)]
struct Misconduct {
    tick: u64,
    severity: f32,
    category: String,
    detail: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Response {
    Receptive,
    Defiant,
}

fn misconduct_from(entry: &LifeEvent) -> Option<Misconduct> {
    let severity = match entry.category.as_str() {
        "gossip" if entry.text.starts_with("spoke against ") => 0.70,
        "jealousy_outburst" if entry.text.starts_with("confronted ") => 0.82,
        "betrayal" => 0.90,
        _ => return None,
    };
    Some(Misconduct {
        tick: entry.tick,
        severity,
        category: entry.category.clone(),
        detail: entry.text.clone(),
    })
}

fn discipline_key(misconduct: &Misconduct) -> String {
    format!("disciplined:{}:{}", misconduct.category, misconduct.tick)
}

fn latest_undisciplined_misconduct(target: &Organism, tick: u64) -> Option<Misconduct> {
    target.life_log.iter().rev().find_map(|entry| {
        if tick.saturating_sub(entry.tick) > MISCONDUCT_WINDOW {
            return None;
        }
        let misconduct = misconduct_from(entry)?;
        (!target
            .last_think_by_kind
            .contains_key(&discipline_key(&misconduct)))
        .then_some(misconduct)
    })
}

fn has_standing(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let parent = target.parent_id == actor.id || target.father_id.as_deref() == Some(actor.id.as_str());
    let elder = actor.is_elder && actor.lineage_id == target.lineage_id;
    let older_kin = actor.lineage_id == target.lineage_id && actor.age >= target.age.saturating_add(600);
    parent
        || elder
        || older_kin
        || actor.friends.contains_key(&target.id)
        || target.org_trust.get(&actor.id).copied().unwrap_or(0.0) >= 0.35
}

fn response_to(sim: &Simulation, actor_idx: usize, target_idx: usize) -> Response {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let parent = target.parent_id == actor.id || target.father_id.as_deref() == Some(actor.id.as_str());
    let authority = parent || (actor.is_elder && actor.lineage_id == target.lineage_id);
    let respect = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    if (authority || respect >= 0.45) && target.traits.aggression <= 0.65 && target.anger <= 0.65 {
        Response::Receptive
    } else {
        Response::Defiant
    }
}

fn choose_target(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<(usize, Misconduct)> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive || actor.energy < MIN_ENERGY {
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
                || !has_standing(sim, actor_idx, target_idx)
                || (target.x - actor.x).abs() + (target.y - actor.y).abs() > 6.0
            {
                return None;
            }
            latest_undisciplined_misconduct(target, sim.tick_count).map(|misconduct| (target_idx, misconduct))
        })
        .max_by(|(left_idx, left), (right_idx, right)| {
            left.severity
                .total_cmp(&right.severity)
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
    let Some((target_idx, misconduct)) = choose_target(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no recent misconduct I have standing to confront");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let target_id = ctx.sim.organisms[target_idx].id.clone();
    let target_name = ctx.sim.organisms[target_idx].name.clone();
    let target_lineage = ctx.sim.organisms[target_idx].lineage_id.clone();
    let response = response_to(ctx.sim, ctx.idx, target_idx);

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        actor.energy = (actor.energy - ENERGY_COST).max(0.0);
        let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
        *trust = (*trust
            - if response == Response::Receptive {
                0.02
            } else {
                0.05
            })
        .max(-1.0);
        actor.log_life_rel(
            ctx.tick,
            "discipline",
            format!("confronted {target_name} over {}", misconduct.detail),
            Some(target_id.clone()),
            Some(target_name.clone()),
        );
    }
    {
        let target = &mut ctx.sim.organisms[target_idx];
        target
            .last_think_by_kind
            .insert(discipline_key(&misconduct), ctx.tick);
        match response {
            Response::Receptive => {
                target.regret = (target.regret + misconduct.severity * 0.14).min(1.0);
                target.anger = (target.anger - 0.06).max(0.0);
                target.comfort = (target.comfort - 0.03).max(0.0);
                let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust + 0.01).min(1.0);
                target.think(&format!("taking {actor_name}'s rebuke seriously"), ctx.tick);
                target.log_life_rel(
                    ctx.tick,
                    "discipline",
                    format!("accepted {actor_name}'s rebuke over {}", misconduct.detail),
                    Some(actor_id.clone()),
                    Some(actor_name.clone()),
                );
            }
            Response::Defiant => {
                target.anger = (target.anger + 0.12).min(1.0);
                target.comfort = (target.comfort - 0.06).max(0.0);
                let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
                *trust = (*trust - 0.08).max(-1.0);
                if actor_lineage != target_lineage {
                    target.update_attitude(&actor_lineage, -0.025);
                }
                target.think(&format!("defying {actor_name}'s rebuke"), ctx.tick);
                target.log_life_rel(
                    ctx.tick,
                    "discipline",
                    format!("rejected {actor_name}'s rebuke over {}", misconduct.detail),
                    Some(actor_id.clone()),
                    Some(actor_name.clone()),
                );
            }
        }
    }
    if response == Response::Defiant && actor_lineage != target_lineage {
        ctx.sim.organisms[ctx.idx].update_attitude(&target_lineage, -0.015);
    }

    match response {
        Response::Receptive => {
            ctx.think(&format!("holding {target_name} accountable"));
            ctx.event(
                "social",
                &format!("rebuked {target_name}, who accepted responsibility"),
            );
            0.008 + misconduct.severity * 0.004
        }
        Response::Defiant => {
            ctx.think(&format!("arguing with defiant {target_name}"));
            ctx.event(
                "drama",
                &format!("rebuked {target_name}, who angrily rejected the criticism"),
            );
            0.002
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn discipline_world() -> (Simulation, usize, usize, usize, usize) {
        let mut sim = Simulation::new(0x5C01_D001);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let elder = 0;
        let offender = 1;
        let listener = 2;
        let victim = 3;
        let lineage = sim.organisms[elder].lineage_id.clone();
        for (index, x) in [
            (elder, 110.0),
            (offender, 111.0),
            (listener, 112.0),
            (victim, 113.0),
        ] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 110.0;
            sim.organisms[index].energy = 0.80;
            sim.organisms[index].age = 2_000;
        }
        sim.organisms[elder].is_elder = true;
        sim.organisms[elder].age = 4_000;
        sim.organisms[offender].traits.aggression = 0.40;
        let offender_id = sim.organisms[offender].id.clone();
        sim.organisms[listener].org_trust.insert(offender_id, 0.50);
        sim.tick_count = 8_000;
        (sim, elder, offender, listener, victim)
    }

    #[test]
    fn elder_can_hold_a_real_gossip_offender_accountable_and_persist_it() {
        let (mut sim, elder, offender, listener, victim) = discipline_world();
        let elder_id = sim.organisms[elder].id.clone();
        let offender_id = sim.organisms[offender].id.clone();
        let victim_id = sim.organisms[victim].id.clone();
        sim.organisms[offender].org_trust.insert(victim_id, -0.70);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, offender, 84, 111, 110, &spatial).is_some());
        let regret_after_gossip = sim.organisms[offender].regret;

        assert!(crate::sim::actions::try_apply(&mut sim, elder, 83, 110, 110, &spatial).is_some());

        assert!(sim.organisms[offender].regret > regret_after_gossip);
        assert_eq!(sim.organisms[offender].org_trust.get(&elder_id), Some(&0.01));
        assert!((sim.organisms[elder].energy - 0.78).abs() < f32::EPSILON);
        assert!(sim.organisms[listener]
            .life_log
            .iter()
            .any(|entry| entry.category == "rumor"));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_offender = loaded.organisms.iter().find(|o| o.id == offender_id).unwrap();
        assert!(loaded_offender
            .life_log
            .iter()
            .any(|entry| entry.category == "discipline" && entry.text.starts_with("accepted ")));
    }

    #[test]
    fn aggressive_person_can_defy_a_respected_friend_and_damage_the_bond() {
        let (mut sim, actor, target, listener, victim) = discipline_world();
        sim.organisms[listener].alive = false;
        sim.organisms[victim].alive = false;
        sim.organisms[actor].is_elder = false;
        sim.organisms[actor].age = sim.organisms[target].age;
        let actor_id = sim.organisms[actor].id.clone();
        sim.organisms[target].org_trust.insert(actor_id.clone(), 0.40);
        sim.organisms[target].traits.aggression = 0.90;
        sim.organisms[target].log_life(7_950, "betrayal", "betrayed a friend's confidence".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 83, 110, 110, &spatial),
            Some(0.002)
        );
        assert!((sim.organisms[target].org_trust[&actor_id] - 0.32).abs() < f32::EPSILON);
        assert!(sim.organisms[target].anger >= 0.12);
        assert_eq!(sim.organisms[target].regret, 0.0);
    }

    #[test]
    fn stale_misconduct_or_missing_standing_hides_and_rejects_scolding() {
        let (mut sim, actor, target, listener, victim) = discipline_world();
        sim.organisms[listener].alive = false;
        sim.organisms[victim].alive = false;
        sim.organisms[actor].is_elder = false;
        sim.organisms[actor].age = sim.organisms[target].age;
        sim.organisms[target].log_life(7_999, "betrayal", "betrayed a confidence".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 110, 110, &spatial).contains(&83));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 83, 110, 110, &spatial),
            None
        );

        sim.organisms[actor].is_elder = true;
        sim.organisms[target].life_log.clear();
        sim.organisms[target].log_life(7_099, "betrayal", "betrayed a confidence".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 110, 110, &spatial).contains(&83));
    }

    #[test]
    fn one_incident_cannot_be_punished_twice_but_new_misconduct_can() {
        let (mut sim, elder, offender, listener, victim) = discipline_world();
        sim.organisms[listener].alive = false;
        sim.organisms[victim].alive = false;
        let offender_id = sim.organisms[offender].id.clone();
        sim.organisms[offender].log_life(7_950, "betrayal", "betrayed a confidence".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, elder, 83, 110, 110, &spatial).is_some());

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_elder = loaded
            .organisms
            .iter()
            .position(|o| o.id == sim.organisms[elder].id)
            .unwrap();
        let loaded_offender = loaded.organisms.iter().position(|o| o.id == offender_id).unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_elder, 110, 110, &spatial).contains(&83)
        );

        loaded.tick_count += 1;
        loaded.organisms[loaded_offender].log_life(
            loaded.tick_count,
            "jealousy_outburst",
            "confronted a partner over a rival".into(),
        );
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_elder, 110, 110, &spatial).contains(&83)
        );
    }
}
