use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex, warfare::has_active_battle_between};

const HOSTILE_ATTITUDE: f32 = -0.25;
const HOSTILE_TRUST: f32 = -0.15;
const MIN_ENERGY: f32 = 0.20;
const ENERGY_COST: f32 = 0.01;

pub(crate) fn has_introduction(person: &crate::organism::organism::Organism, other_id: &str) -> bool {
    person.acquaintances.contains(other_id)
        || person
            .life_log
            .iter()
            .rev()
            .any(|entry| entry.category == "introduction" && entry.related_id.as_deref() == Some(other_id))
}

fn can_meet(sim: &Simulation, actor_idx: usize, target_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let target = &sim.organisms[target_idx];
    let actor_trust = actor.org_trust.get(&target.id).copied().unwrap_or(0.0);
    let target_trust = target.org_trust.get(&actor.id).copied().unwrap_or(0.0);
    actor.lineage_id != target.lineage_id
        && actor.attitude_toward(&target.lineage_id) > HOSTILE_ATTITUDE
        && target.attitude_toward(&actor.lineage_id) > HOSTILE_ATTITUDE
        && actor_trust > HOSTILE_TRUST
        && target_trust > HOSTILE_TRUST
        && actor.anger < 0.70
        && target.anger < 0.70
        && !has_introduction(actor, &target.id)
        && !has_introduction(target, &actor.id)
        && !has_active_battle_between(&sim.battles, &actor.lineage_id, &target.lineage_id)
}

fn choose_stranger(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive || actor.energy < MIN_ENERGY {
        return None;
    }
    nearby
        .iter()
        .copied()
        .filter(|&target_idx| {
            let target = &sim.organisms[target_idx];
            target_idx != actor_idx
                && target.alive
                && can_meet(sim, actor_idx, target_idx)
                && (target.x - actor.x).abs() + (target.y - actor.y).abs() <= 6.0
        })
        .max_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_openness = actor.attitude_toward(&left_org.lineage_id)
                + left_org.attitude_toward(&actor.lineage_id)
                + actor.org_trust.get(&left_org.id).copied().unwrap_or(0.0)
                + left_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            let right_openness = actor.attitude_toward(&right_org.lineage_id)
                + right_org.attitude_toward(&actor.lineage_id)
                + actor.org_trust.get(&right_org.id).copied().unwrap_or(0.0)
                + right_org.org_trust.get(&actor.id).copied().unwrap_or(0.0);
            left_openness
                .total_cmp(&right_openness)
                .then_with(|| right_org.id.cmp(&left_org.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_stranger(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(target_idx) = choose_stranger(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no unfamiliar, peaceful stranger is ready to meet");
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
        actor.energy = (actor.energy - ENERGY_COST).max(0.0);
        actor.comfort = (actor.comfort + 0.025).min(1.0);
        actor.curiosity_drive = (actor.curiosity_drive + 0.025).min(1.0);
        actor.fear_level = (actor.fear_level - 0.02).max(0.0);
        let trust = actor.org_trust.entry(target_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        actor.update_attitude(&target_lineage, 0.025);
        actor.acquaintances.insert(target_id.clone());
        actor.log_life_rel(
            ctx.tick,
            "introduction",
            format!("first met {target_name} of another people"),
            Some(target_id.clone()),
            Some(target_name.clone()),
        );
    }
    {
        let target = &mut ctx.sim.organisms[target_idx];
        target.comfort = (target.comfort + 0.025).min(1.0);
        target.curiosity_drive = (target.curiosity_drive + 0.025).min(1.0);
        target.fear_level = (target.fear_level - 0.02).max(0.0);
        let trust = target.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        target.update_attitude(&actor_lineage, 0.025);
        target.acquaintances.insert(actor_id.clone());
        target.think(&format!("meeting {actor_name} for the first time"), ctx.tick);
        target.log_life_rel(
            ctx.tick,
            "introduction",
            format!("first met {actor_name} of another people"),
            Some(actor_id),
            Some(actor_name.clone()),
        );
    }

    ctx.think(&format!("greeting unfamiliar {target_name}"));
    ctx.event(
        "social",
        &format!("peacefully introduced themselves to {target_name}"),
    );
    0.008
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::warfare::{Battle, BattleScale};

    fn greeting_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0x6AEE_7101);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let guarded = 1;
        let open = 2;
        for (index, x) in [(actor, 120.0), (guarded, 121.0), (open, 122.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 120.0;
            sim.organisms[index].energy = 0.80;
        }
        sim.organisms[actor].lineage_id = "river-people".into();
        sim.organisms[guarded].lineage_id = "hill-people".into();
        sim.organisms[open].lineage_id = "forest-people".into();
        let actor_id = sim.organisms[actor].id.clone();
        let open_id = sim.organisms[open].id.clone();
        sim.organisms[actor].org_trust.insert(open_id, 0.10);
        sim.organisms[open].org_trust.insert(actor_id, 0.10);
        sim.tick_count = 9_000;
        (sim, actor, guarded, open)
    }

    #[test]
    fn greeting_selects_the_most_open_stranger_and_persists_reciprocal_introduction() {
        let (mut sim, actor, guarded, open) = greeting_world();
        let actor_id = sim.organisms[actor].id.clone();
        let open_id = sim.organisms[open].id.clone();
        let guarded_id = sim.organisms[guarded].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 85, 120, 120, &spatial).is_some());

        assert_eq!(sim.organisms[actor].org_trust.get(&open_id), Some(&0.14));
        assert_eq!(sim.organisms[open].org_trust.get(&actor_id), Some(&0.14));
        assert!(!sim.organisms[actor].org_trust.contains_key(&guarded_id));
        assert!((sim.organisms[actor].energy - 0.79).abs() < f32::EPSILON);
        assert!(sim.organisms[actor].attitude_toward("forest-people") > 0.0);
        assert!(sim.organisms[open].attitude_toward("river-people") > 0.0);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_open = loaded.organisms.iter().find(|o| o.id == open_id).unwrap();
        assert!(loaded_open.life_log.iter().any(|entry| {
            entry.category == "introduction" && entry.related_id.as_deref() == Some(actor_id.as_str())
        }));
    }

    #[test]
    fn an_introduction_is_one_time_and_invalid_forced_repeats_are_rejected() {
        let (mut sim, actor, guarded, open) = greeting_world();
        sim.organisms[guarded].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 85, 120, 120, &spatial).is_some());
        assert!(!crate::sim::actions::available_actions(&sim, actor, 120, 120, &spatial).contains(&85));
        assert!(!crate::sim::actions::available_actions(&sim, open, 122, 120, &spatial).contains(&85));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 85, 120, 120, &spatial),
            None
        );
    }

    #[test]
    fn first_contact_survives_recent_life_log_eviction_and_save_reload() {
        let (mut sim, actor, guarded, open) = greeting_world();
        sim.organisms[guarded].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let open_id = sim.organisms[open].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 85, 120, 120, &spatial).is_some());

        for offset in 1..=30 {
            sim.organisms[actor].log_life(
                sim.tick_count + offset,
                "routine",
                format!("ordinary day {offset}"),
            );
            sim.organisms[open].log_life(
                sim.tick_count + offset,
                "routine",
                format!("ordinary day {offset}"),
            );
        }
        assert!(!sim.organisms[actor]
            .life_log
            .iter()
            .any(|entry| entry.category == "introduction"));
        assert!(has_introduction(&sim.organisms[actor], &open_id));
        assert!(has_introduction(&sim.organisms[open], &actor_id));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded.organisms.iter().position(|o| o.id == actor_id).unwrap();
        let loaded_open = loaded.organisms.iter().position(|o| o.id == open_id).unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(has_introduction(&loaded.organisms[loaded_actor], &open_id));
        assert!(has_introduction(&loaded.organisms[loaded_open], &actor_id));
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_actor, 120, 120, &spatial,).contains(&85)
        );
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_actor, 120, 120, &spatial,).contains(&89)
        );
    }

    #[test]
    fn hostility_blocks_first_contact_without_mutating_relationships() {
        let (mut sim, actor, guarded, open) = greeting_world();
        sim.organisms[open].alive = false;
        sim.organisms[actor]
            .lineage_attitudes
            .insert("hill-people".into(), -0.40);
        let actor_trust = sim.organisms[actor].org_trust.clone();
        let guarded_trust = sim.organisms[guarded].org_trust.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, actor, 120, 120, &spatial).contains(&85));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 85, 120, 120, &spatial),
            None
        );
        assert_eq!(sim.organisms[actor].org_trust, actor_trust);
        assert_eq!(sim.organisms[guarded].org_trust, guarded_trust);
    }

    #[test]
    fn active_battle_blocks_greeting_until_the_conflict_ends() {
        let (mut sim, actor, guarded, open) = greeting_world();
        sim.organisms[guarded].alive = false;
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let open_lineage = sim.organisms[open].lineage_id.clone();
        sim.battles.push(Battle {
            id: "first-contact-war".into(),
            attackers: vec![actor_lineage],
            defenders: vec![open_lineage],
            attacker_orgs: Vec::new(),
            defender_orgs: Vec::new(),
            scale: BattleScale::Skirmish,
            location: (120, 120),
            started_tick: 8_900,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 1,
            initial_d: 1,
        });
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 120, 120, &spatial).contains(&85));

        sim.battles[0].ended_tick = Some(sim.tick_count);
        assert!(crate::sim::actions::available_actions(&sim, actor, 120, 120, &spatial).contains(&85));
    }
}
