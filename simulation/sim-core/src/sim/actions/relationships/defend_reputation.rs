use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::Organism,
    sim::{simulation::Simulation, spatial::SpatialIndex},
};

const RUMOR_WINDOW: u64 = 1_200;
const DEFENSE_COOLDOWN: u64 = 480;
const MIN_ENERGY: f32 = 0.25;
const ENERGY_COST: f32 = 0.03;
const MAX_AUDIENCE: usize = 4;

#[derive(Clone, Debug, PartialEq, Eq)]
struct RumorAttack {
    tick: u64,
    accuser_id: String,
    accuser_name: String,
}

fn cooldown_key(accuser_id: &str) -> String {
    format!("defend_reputation:{accuser_id}")
}

fn latest_attack(actor: &Organism, tick: u64) -> Option<RumorAttack> {
    actor.life_log.iter().rev().find_map(|entry| {
        if entry.category != "rumor"
            || !entry.text.contains("spread a damaging rumor about me")
            || tick.saturating_sub(entry.tick) > RUMOR_WINDOW
        {
            return None;
        }
        Some(RumorAttack {
            tick: entry.tick,
            accuser_id: entry.related_id.clone()?,
            accuser_name: entry.related_name.clone().unwrap_or_else(|| "someone".into()),
        })
    })
}

fn heard_attack(listener: &Organism, actor_id: &str, attack_tick: u64) -> bool {
    listener.life_log.iter().rev().any(|entry| {
        entry.tick == attack_tick
            && entry.category == "rumor"
            && entry.related_id.as_deref() == Some(actor_id)
            && entry.text.starts_with("heard ")
            && entry.text.contains(" speak against ")
    })
}

fn choose_audience(
    sim: &Simulation,
    actor_idx: usize,
    nearby: &[usize],
) -> Option<(RumorAttack, Vec<usize>)> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive || actor.energy < MIN_ENERGY {
        return None;
    }
    let attack = latest_attack(actor, sim.tick_count)?;
    if actor
        .last_think_by_kind
        .get(&cooldown_key(&attack.accuser_id))
        .is_some_and(|last| sim.tick_count.saturating_sub(*last) < DEFENSE_COOLDOWN)
    {
        return None;
    }

    let mut audience: Vec<usize> = nearby
        .iter()
        .copied()
        .filter(|&listener_idx| {
            let listener = &sim.organisms[listener_idx];
            listener_idx != actor_idx
                && listener.alive
                && listener.id != attack.accuser_id
                && heard_attack(listener, &actor.id, attack.tick)
                && (listener.x - actor.x).abs() + (listener.y - actor.y).abs() <= 6.0
        })
        .collect();
    audience.sort_by(|&left, &right| {
        let left_trust = sim.organisms[left]
            .org_trust
            .get(&actor.id)
            .copied()
            .unwrap_or(0.0);
        let right_trust = sim.organisms[right]
            .org_trust
            .get(&actor.id)
            .copied()
            .unwrap_or(0.0);
        left_trust
            .total_cmp(&right_trust)
            .then_with(|| sim.organisms[left].id.cmp(&sim.organisms[right].id))
    });
    audience.truncate(MAX_AUDIENCE);
    (!audience.is_empty()).then_some((attack, audience))
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_audience(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((attack, audience)) = choose_audience(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no nearby listener heard a recent rumor about me");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let credibility = (0.04 + ctx.sim.organisms[ctx.idx].traits.social_tendency * 0.06
        - ctx.sim.organisms[ctx.idx].regret * 0.035)
        .clamp(0.02, 0.10);

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        actor
            .last_think_by_kind
            .insert(cooldown_key(&attack.accuser_id), ctx.tick);
        actor.energy = (actor.energy - ENERGY_COST).max(0.0);
        actor.comfort = (actor.comfort + 0.035).min(1.0);
        actor.fear_level = (actor.fear_level - 0.04).max(0.0);
        actor.log_life_rel(
            ctx.tick,
            "reputation",
            format!(
                "answered {}'s damaging rumor before {} listeners",
                attack.accuser_name,
                audience.len()
            ),
            Some(attack.accuser_id.clone()),
            Some(attack.accuser_name.clone()),
        );
    }

    for &listener_idx in &audience {
        let listener = &mut ctx.sim.organisms[listener_idx];
        let trust = listener.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + credibility).min(1.0);
        listener.think(&format!("hearing {actor_name} answer the rumor"), ctx.tick);
        listener.log_life_rel(
            ctx.tick,
            "reputation",
            format!("heard {actor_name} answer {}'s rumor", attack.accuser_name),
            Some(actor_id.clone()),
            Some(actor_name.clone()),
        );
        if listener.lineage_id != actor_lineage {
            listener.update_attitude(&actor_lineage, credibility * 0.20);
        }
    }

    ctx.think(&format!("answering {}'s rumor", attack.accuser_name));
    ctx.event(
        "social",
        &format!("answered a damaging rumor before {} listeners", audience.len()),
    );
    0.006 + credibility * audience.len() as f32 * 0.03
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::actions::social::gossip::transmit_gossip;

    fn reputation_world() -> (Simulation, usize, usize, usize, usize) {
        let mut sim = Simulation::new(0x7E90_7A71);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let target = 0;
        let speaker = 1;
        let listener = 2;
        let uninvolved = 3;
        for (index, x) in [
            (target, 90.0),
            (speaker, 91.0),
            (listener, 92.0),
            (uninvolved, 93.0),
        ] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 90.0;
            sim.organisms[index].energy = 0.80;
        }
        sim.organisms[target].traits.social_tendency = 0.50;
        sim.tick_count = 6_000;
        (sim, target, speaker, listener, uninvolved)
    }

    #[test]
    fn negative_gossip_creates_matching_evidence_and_defense_repairs_its_listener() {
        let (mut sim, target, speaker, listener, uninvolved) = reputation_world();
        let target_id = sim.organisms[target].id.clone();
        assert!(transmit_gossip(
            &mut sim.organisms,
            speaker,
            listener,
            target,
            -0.60,
            sim.tick_count,
        ));
        assert!((sim.organisms[listener].org_trust[&target_id] + 0.18).abs() < f32::EPSILON);
        assert!(sim.organisms[target]
            .life_log
            .iter()
            .any(|entry| entry.category == "rumor"));
        assert!(sim.organisms[listener]
            .life_log
            .iter()
            .any(|entry| entry.category == "rumor" && entry.related_id.as_deref() == Some(&target_id)));

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, target, 235, 90, 90, &spatial).is_some());
        assert!((sim.organisms[listener].org_trust[&target_id] + 0.11).abs() < f32::EPSILON);
        assert!(sim.organisms[uninvolved].org_trust.is_empty());
        assert!((sim.organisms[target].energy - 0.77).abs() < f32::EPSILON);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_target = loaded.organisms.iter().find(|o| o.id == target_id).unwrap();
        assert!(loaded_target
            .life_log
            .iter()
            .any(|entry| entry.category == "reputation"));
    }

    #[test]
    fn no_matching_or_stale_rumor_hides_and_rejects_action() {
        let (mut sim, target, speaker, listener, _) = reputation_world();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, target, 90, 90, &spatial).contains(&235));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, target, 235, 90, 90, &spatial),
            None
        );

        assert!(transmit_gossip(
            &mut sim.organisms,
            speaker,
            listener,
            target,
            -0.50,
            4_799,
        ));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, target, 90, 90, &spatial).contains(&235));
    }

    #[test]
    fn one_defense_addresses_multiple_real_listeners_but_not_bystanders() {
        let (mut sim, target, speaker, listener, uninvolved) = reputation_world();
        let second_listener = 4;
        sim.organisms[second_listener].alive = true;
        sim.organisms[second_listener].x = 94.0;
        sim.organisms[second_listener].y = 90.0;
        let tick = sim.tick_count;
        assert!(transmit_gossip(
            &mut sim.organisms,
            speaker,
            listener,
            target,
            -0.40,
            tick,
        ));
        assert!(transmit_gossip(
            &mut sim.organisms,
            speaker,
            second_listener,
            target,
            -0.70,
            tick,
        ));
        let target_id = sim.organisms[target].id.clone();
        let before_first = sim.organisms[listener].org_trust[&target_id];
        let before_second = sim.organisms[second_listener].org_trust[&target_id];
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, target, 235, 90, 90, &spatial).is_some());
        assert!(sim.organisms[listener].org_trust[&target_id] > before_first);
        assert!(sim.organisms[second_listener].org_trust[&target_id] > before_second);
        assert!(sim.organisms[uninvolved].org_trust.is_empty());
    }

    #[test]
    fn defense_cooldown_persists_and_reopens_at_the_exact_boundary() {
        let (mut sim, target, speaker, listener, _) = reputation_world();
        let target_id = sim.organisms[target].id.clone();
        let tick = sim.tick_count;
        assert!(transmit_gossip(
            &mut sim.organisms,
            speaker,
            listener,
            target,
            -0.60,
            tick,
        ));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, target, 235, 90, 90, &spatial).is_some());

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_target = loaded.organisms.iter().position(|o| o.id == target_id).unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_target, 90, 90, &spatial).contains(&235)
        );
        loaded.tick_count += DEFENSE_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_target, 90, 90, &spatial).contains(&235)
        );
    }

    #[test]
    fn foreign_listener_softens_attitude_after_hearing_the_defense() {
        let (mut sim, target, speaker, listener, uninvolved) = reputation_world();
        sim.organisms[uninvolved].alive = false;
        let target_lineage = sim.organisms[target].lineage_id.clone();
        sim.organisms[listener].lineage_id = "foreign-audience".into();
        let tick = sim.tick_count;
        assert!(transmit_gossip(
            &mut sim.organisms,
            speaker,
            listener,
            target,
            -0.50,
            tick,
        ));
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, target, 235, 90, 90, &spatial).is_some());
        assert!(sim.organisms[listener].attitude_toward(&target_lineage) > 0.0);
    }
}
