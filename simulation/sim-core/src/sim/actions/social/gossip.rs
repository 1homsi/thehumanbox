use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const MIN_OPINION: f32 = 0.25;
const MIN_ENERGY: f32 = 0.25;
const ENERGY_COST: f32 = 0.02;
const GOSSIP_COOLDOWN: u64 = 360;

#[derive(Clone, Copy, Debug, PartialEq)]
struct GossipPlan {
    listener_idx: usize,
    target_idx: usize,
    sentiment: f32,
}

fn cooldown_key(target_id: &str) -> String {
    format!("gossip:{target_id}")
}

pub(crate) fn transmit_gossip(
    organisms: &mut [Organism],
    speaker_idx: usize,
    listener_idx: usize,
    target_idx: usize,
    sentiment: f32,
    tick: u64,
) -> bool {
    if speaker_idx == listener_idx
        || speaker_idx == target_idx
        || listener_idx == target_idx
        || !organisms[speaker_idx].alive
        || !organisms[listener_idx].alive
        || !organisms[target_idx].alive
    {
        return false;
    }

    let speaker_id = organisms[speaker_idx].id.clone();
    let speaker_name = organisms[speaker_idx].name.clone();
    let listener_name = organisms[listener_idx].name.clone();
    let target_id = organisms[target_idx].id.clone();
    let target_name = organisms[target_idx].name.clone();
    let trust = organisms[listener_idx]
        .org_trust
        .entry(target_id.clone())
        .or_insert(0.0);
    *trust = (*trust + sentiment * 0.3).clamp(-1.0, 1.0);

    if sentiment < -0.05 {
        organisms[listener_idx].log_life_rel(
            tick,
            "rumor",
            format!("heard {speaker_name} speak against {target_name}"),
            Some(target_id),
            Some(target_name),
        );
        organisms[target_idx].log_life_rel(
            tick,
            "rumor",
            format!("{speaker_name} spread a damaging rumor about me to {listener_name}"),
            Some(speaker_id.clone()),
            Some(speaker_name),
        );
        let target_trust = organisms[target_idx].org_trust.entry(speaker_id).or_insert(0.0);
        *target_trust = (*target_trust - 0.05).max(-1.0);
        organisms[target_idx].anger = (organisms[target_idx].anger + 0.04).min(1.0);
        organisms[speaker_idx].regret = (organisms[speaker_idx].regret + 0.02).min(1.0);
    }
    true
}

fn choose_gossip(sim: &Simulation, speaker_idx: usize, nearby: &[usize]) -> Option<GossipPlan> {
    let speaker = &sim.organisms[speaker_idx];
    if !speaker.alive || speaker.energy < MIN_ENERGY {
        return None;
    }

    nearby
        .iter()
        .copied()
        .filter_map(|target_idx| {
            if target_idx == speaker_idx {
                return None;
            }
            let target = &sim.organisms[target_idx];
            let sentiment = speaker.org_trust.get(&target.id).copied().unwrap_or(0.0);
            if !target.alive
                || sentiment.abs() < MIN_OPINION
                || speaker
                    .last_think_by_kind
                    .get(&cooldown_key(&target.id))
                    .is_some_and(|last| sim.tick_count.saturating_sub(*last) < GOSSIP_COOLDOWN)
                || (target.x - speaker.x).abs() + (target.y - speaker.y).abs() > 6.0
            {
                return None;
            }

            nearby
                .iter()
                .copied()
                .filter(|&listener_idx| {
                    if listener_idx == speaker_idx || listener_idx == target_idx {
                        return false;
                    }
                    let listener = &sim.organisms[listener_idx];
                    let listener_trust = listener.org_trust.get(&speaker.id).copied().unwrap_or(0.0);
                    listener.alive
                        && (listener.lineage_id == speaker.lineage_id || listener_trust >= 0.15)
                        && (listener.x - speaker.x).abs() + (listener.y - speaker.y).abs() <= 6.0
                })
                .max_by(|&left, &right| {
                    let left_trust = sim.organisms[left]
                        .org_trust
                        .get(&speaker.id)
                        .copied()
                        .unwrap_or(0.0);
                    let right_trust = sim.organisms[right]
                        .org_trust
                        .get(&speaker.id)
                        .copied()
                        .unwrap_or(0.0);
                    left_trust
                        .total_cmp(&right_trust)
                        .then_with(|| sim.organisms[right].id.cmp(&sim.organisms[left].id))
                })
                .map(|listener_idx| GossipPlan {
                    listener_idx,
                    target_idx,
                    sentiment,
                })
        })
        .max_by(|left, right| {
            left.sentiment
                .abs()
                .total_cmp(&right.sentiment.abs())
                .then_with(|| {
                    sim.organisms[right.target_idx]
                        .id
                        .cmp(&sim.organisms[left.target_idx].id)
                })
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, speaker_idx: usize, nearby: &[usize]) -> bool {
    choose_gossip(sim, speaker_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, speaker_idx: usize, spatial: &SpatialIndex) -> bool {
    let speaker = &sim.organisms[speaker_idx];
    let nearby = spatial.query(speaker.x as i32, speaker.y as i32, 6);
    can_apply_with_nearby(sim, speaker_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(plan) = choose_gossip(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no trusted listener and strong opinion to share");
        return 0.0;
    };

    let speaker_id = ctx.sim.organisms[ctx.idx].id.clone();
    let speaker_name = ctx.sim.organisms[ctx.idx].name.clone();
    let listener_id = ctx.sim.organisms[plan.listener_idx].id.clone();
    let listener_name = ctx.sim.organisms[plan.listener_idx].name.clone();
    let target_id = ctx.sim.organisms[plan.target_idx].id.clone();
    let target_name = ctx.sim.organisms[plan.target_idx].name.clone();
    if !transmit_gossip(
        &mut ctx.sim.organisms,
        ctx.idx,
        plan.listener_idx,
        plan.target_idx,
        plan.sentiment,
        ctx.tick,
    ) {
        return 0.0;
    }

    {
        let speaker = &mut ctx.sim.organisms[ctx.idx];
        speaker
            .last_think_by_kind
            .insert(cooldown_key(&target_id), ctx.tick);
        speaker.energy = (speaker.energy - ENERGY_COST).max(0.0);
        speaker.boredom = (speaker.boredom - 0.08).max(0.0);
        let trust = speaker.org_trust.entry(listener_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.015).min(1.0);
        speaker.log_life_rel(
            ctx.tick,
            "gossip",
            if plan.sentiment < 0.0 {
                format!("spoke against {target_name} to {listener_name}")
            } else {
                format!("praised {target_name} to {listener_name}")
            },
            Some(target_id.clone()),
            Some(target_name.clone()),
        );
    }
    {
        let listener = &mut ctx.sim.organisms[plan.listener_idx];
        listener.boredom = (listener.boredom - 0.05).max(0.0);
        let trust = listener.org_trust.entry(speaker_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.015).min(1.0);
        listener.think(
            &format!("hearing {speaker_name}'s opinion of {target_name}"),
            ctx.tick,
        );
    }
    if plan.sentiment < 0.0 {
        ctx.sim.organisms[plan.target_idx].think(&format!("angered by {speaker_name}'s rumor"), ctx.tick);
    }

    ctx.think(&format!("talking to {listener_name} about {target_name}"));
    let kind = if plan.sentiment < 0.0 { "drama" } else { "social" };
    let detail = if plan.sentiment < 0.0 {
        format!("spread a damaging rumor about {target_name} to {listener_name}")
    } else {
        format!("shared warm praise of {target_name} with {listener_name}")
    };
    ctx.event(kind, &detail);
    0.004 + plan.sentiment.abs() * 0.006
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

    fn gossip_world() -> (Simulation, usize, usize, usize, usize) {
        let mut sim = Simulation::new(0x6055_1A02);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let speaker = 0;
        let listener = 1;
        let weaker_target = 2;
        let stronger_target = 3;
        let lineage = sim.organisms[speaker].lineage_id.clone();
        for (index, x) in [
            (speaker, 100.0),
            (listener, 101.0),
            (weaker_target, 102.0),
            (stronger_target, 103.0),
        ] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 100.0;
            sim.organisms[index].energy = 0.80;
        }
        let speaker_id = sim.organisms[speaker].id.clone();
        sim.organisms[listener].org_trust.insert(speaker_id, 0.50);
        sim.tick_count = 7_000;
        (sim, speaker, listener, weaker_target, stronger_target)
    }

    #[test]
    fn positive_gossip_preserves_trust_transfer_without_creating_attack_evidence() {
        let mut sim = Simulation::new(0x6055_1A01);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let speaker = 0;
        let listener = 1;
        let target = 2;
        for index in [speaker, listener, target] {
            sim.organisms[index].alive = true;
        }
        let target_id = sim.organisms[target].id.clone();

        assert!(transmit_gossip(
            &mut sim.organisms,
            speaker,
            listener,
            target,
            0.60,
            100,
        ));

        assert!((sim.organisms[listener].org_trust[&target_id] - 0.18).abs() < f32::EPSILON);
        assert!(!sim.organisms[listener]
            .life_log
            .iter()
            .any(|entry| entry.category == "rumor"));
        assert!(!sim.organisms[target]
            .life_log
            .iter()
            .any(|entry| entry.category == "rumor"));
    }

    #[test]
    fn deliberate_gossip_uses_the_strongest_opinion_and_enables_reputation_defense() {
        let (mut sim, speaker, listener, weaker_target, stronger_target) = gossip_world();
        let weaker_id = sim.organisms[weaker_target].id.clone();
        let stronger_id = sim.organisms[stronger_target].id.clone();
        let speaker_id = sim.organisms[speaker].id.clone();
        sim.organisms[speaker].org_trust.insert(weaker_id, -0.30);
        sim.organisms[speaker]
            .org_trust
            .insert(stronger_id.clone(), -0.70);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, speaker, 84, 100, 100, &spatial).is_some());

        assert!((sim.organisms[listener].org_trust[&stronger_id] + 0.21).abs() < f32::EPSILON);
        assert!(!sim.organisms[listener]
            .org_trust
            .contains_key(&sim.organisms[weaker_target].id));
        assert_eq!(
            sim.organisms[stronger_target].org_trust.get(&speaker_id),
            Some(&-0.05)
        );
        assert!(sim.organisms[stronger_target].anger > 0.0);
        assert!((sim.organisms[speaker].energy - 0.78).abs() < f32::EPSILON);
        assert!(
            crate::sim::actions::available_actions(&sim, stronger_target, 103, 100, &spatial).contains(&235)
        );
    }

    #[test]
    fn positive_deliberate_gossip_builds_target_trust_without_a_rumor_attack() {
        let (mut sim, speaker, listener, weaker_target, stronger_target) = gossip_world();
        sim.organisms[weaker_target].alive = false;
        let target_id = sim.organisms[stronger_target].id.clone();
        sim.organisms[speaker].org_trust.insert(target_id.clone(), 0.60);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, speaker, 84, 100, 100, &spatial).is_some());

        assert!((sim.organisms[listener].org_trust[&target_id] - 0.18).abs() < f32::EPSILON);
        assert!(!sim.organisms[stronger_target]
            .life_log
            .iter()
            .any(|entry| entry.category == "rumor"));
        assert!(sim.organisms[speaker]
            .life_log
            .iter()
            .any(|entry| entry.category == "gossip" && entry.text.starts_with("praised ")));
    }

    #[test]
    fn gossip_requires_a_listener_target_and_strong_opinion_at_execution() {
        let (mut sim, speaker, _, _, _) = gossip_world();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, speaker, 100, 100, &spatial).contains(&84));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, speaker, 84, 100, 100, &spatial),
            None
        );

        for index in 1..sim.organisms.len() {
            sim.organisms[index].alive = false;
        }
        let absent_target_id = sim.organisms[2].id.clone();
        sim.organisms[speaker].org_trust.insert(absent_target_id, -0.80);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, speaker, 100, 100, &spatial).contains(&84));
    }

    #[test]
    fn gossip_cooldown_persists_and_reopens_at_the_exact_boundary() {
        let (mut sim, speaker, _, weaker_target, stronger_target) = gossip_world();
        sim.organisms[weaker_target].alive = false;
        let speaker_id = sim.organisms[speaker].id.clone();
        let target_id = sim.organisms[stronger_target].id.clone();
        sim.organisms[speaker].org_trust.insert(target_id, -0.60);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, speaker, 84, 100, 100, &spatial).is_some());

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_speaker = loaded.organisms.iter().position(|o| o.id == speaker_id).unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_speaker, 100, 100, &spatial)
                .contains(&84)
        );
        loaded.tick_count += GOSSIP_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_speaker, 100, 100, &spatial).contains(&84)
        );
    }
}
