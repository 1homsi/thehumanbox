use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::Organism,
    sim::{simulation::Simulation, spatial::SpatialIndex},
    world::tiles::Tile,
};

const RITUAL_COOLDOWN_KEY: &str = "bond_ritual";
const RITUAL_COOLDOWN: u64 = 600;
const LEADER_MIN_ENERGY: f32 = 0.35;
const PARTICIPANT_MIN_ENERGY: f32 = 0.25;
const ENERGY_COST: f32 = 0.04;
const MAX_PARTICIPANTS: usize = 6;

fn ready_for_ritual(organism: &Organism, tick: u64) -> bool {
    organism
        .last_think_by_kind
        .get(RITUAL_COOLDOWN_KEY)
        .is_none_or(|last| tick.saturating_sub(*last) >= RITUAL_COOLDOWN)
}

fn campfire_near(sim: &Simulation, actor_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let (x, y) = (actor.x as i32, actor.y as i32);
    (-3i32..=3).any(|dx| {
        (-3i32..=3).any(|dy| dx.abs() + dy.abs() <= 3 && sim.grid.get(x + dx, y + dy) == Tile::Campfire)
    })
}

fn support_need(organism: &Organism) -> f32 {
    organism.loneliness
        + organism.fear_level * 0.7
        + organism.boredom * 0.5
        + organism.grief_ticks.min(400) as f32 / 400.0
}

fn choose_participants(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<Vec<usize>> {
    let actor = &sim.organisms[actor_idx];
    if !actor.alive
        || actor.energy < LEADER_MIN_ENERGY
        || !ready_for_ritual(actor, sim.tick_count)
        || !campfire_near(sim, actor_idx)
    {
        return None;
    }

    let mut others: Vec<usize> = nearby
        .iter()
        .copied()
        .filter(|&index| {
            let participant = &sim.organisms[index];
            index != actor_idx
                && participant.alive
                && participant.lineage_id == actor.lineage_id
                && participant.energy >= PARTICIPANT_MIN_ENERGY
                && ready_for_ritual(participant, sim.tick_count)
                && (participant.x - actor.x).abs() + (participant.y - actor.y).abs() <= 6.0
        })
        .collect();
    others.sort_by(|&left, &right| {
        support_need(&sim.organisms[right])
            .total_cmp(&support_need(&sim.organisms[left]))
            .then_with(|| sim.organisms[left].id.cmp(&sim.organisms[right].id))
    });
    others.truncate(MAX_PARTICIPANTS - 1);
    if others.len() < 2 {
        return None;
    }

    let mut participants = Vec::with_capacity(others.len() + 1);
    participants.push(actor_idx);
    participants.extend(others);
    Some(participants)
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_participants(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(participants) = choose_participants(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("a bond ritual needs a campfire and two rested kin");
        return 0.0;
    };

    let leader_id = ctx.sim.organisms[ctx.idx].id.clone();
    let leader_name = ctx.sim.organisms[ctx.idx].name.clone();
    let identities: Vec<(String, String)> = participants
        .iter()
        .map(|&index| {
            (
                ctx.sim.organisms[index].id.clone(),
                ctx.sim.organisms[index].name.clone(),
            )
        })
        .collect();

    for (slot, &index) in participants.iter().enumerate() {
        let participant = &mut ctx.sim.organisms[index];
        participant.mark_thought(RITUAL_COOLDOWN_KEY, ctx.tick);
        participant.energy = (participant.energy - ENERGY_COST).max(0.0);
        participant.comfort = (participant.comfort + 0.08).min(1.0);
        participant.loneliness = (participant.loneliness - 0.10).max(0.0);
        participant.fear_level = (participant.fear_level - 0.05).max(0.0);
        participant.boredom = (participant.boredom - 0.10).max(0.0);
        participant.spiritual = (participant.spiritual + 0.04).min(1.0);
        participant.grief_ticks = participant.grief_ticks.saturating_sub(25);
        participant.joy_ticks = participant.joy_ticks.saturating_add(80).min(1_200);
        participant.discoveries.insert("bond_ritual".to_string());
        for (other_slot, (other_id, _)) in identities.iter().enumerate() {
            if other_slot == slot {
                continue;
            }
            let trust = participant.org_trust.entry(other_id.clone()).or_insert(0.0);
            *trust = (*trust + 0.05).min(1.0);
        }
        let related = (index != ctx.idx).then(|| leader_id.clone());
        let related_name = (index != ctx.idx).then(|| leader_name.clone());
        participant.log_life_rel(
            ctx.tick,
            "bond_ritual",
            format!("gathered with {} people around the campfire", participants.len()),
            related,
            related_name,
        );
        if index != ctx.idx {
            participant.think(&format!("gathering around the fire with {leader_name}"), ctx.tick);
        }
    }

    ctx.think("leading a bond ritual around the campfire");
    ctx.event(
        "ritual",
        &format!(
            "brought {} people together around the campfire",
            participants.len()
        ),
    );
    0.012 + participants.len() as f32 * 0.004
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ritual_world() -> (Simulation, usize, usize, usize, usize) {
        let mut sim = Simulation::new(0xB04D_711A);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let leader = 0;
        let first = 1;
        let second = 2;
        let outsider = 3;
        let lineage = sim.organisms[leader].lineage_id.clone();
        for (index, x) in [(leader, 60.0), (first, 61.0), (second, 62.0), (outsider, 63.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 60.0;
            sim.organisms[index].energy = 0.80;
        }
        sim.organisms[first].lineage_id.clone_from(&lineage);
        sim.organisms[second].lineage_id.clone_from(&lineage);
        sim.organisms[outsider].lineage_id = "outsider-lineage".into();
        sim.grid.set(60, 61, Tile::Campfire);
        sim.tick_count = 4_000;
        (sim, leader, first, second, outsider)
    }

    #[test]
    fn campfire_ritual_costs_energy_and_builds_a_persistent_group_bond() {
        let (mut sim, leader, first, second, outsider) = ritual_world();
        let leader_id = sim.organisms[leader].id.clone();
        let first_id = sim.organisms[first].id.clone();
        let second_id = sim.organisms[second].id.clone();
        let inventories: Vec<(u8, u8, u8, u8)> = sim
            .organisms
            .iter()
            .take(4)
            .map(|o| (o.inv_food, o.inv_water, o.inv_wood, o.inv_stone))
            .collect();
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, leader, 240, 60, 60, &spatial).is_some());

        for index in [leader, first, second] {
            assert!((sim.organisms[index].energy - 0.76).abs() < f32::EPSILON);
            assert!(sim.organisms[index].discoveries.contains("bond_ritual"));
            assert!(sim.organisms[index]
                .life_log
                .iter()
                .any(|entry| entry.category == "bond_ritual"));
        }
        assert_eq!(sim.organisms[leader].org_trust.get(&first_id), Some(&0.05));
        assert_eq!(sim.organisms[first].org_trust.get(&second_id), Some(&0.05));
        assert_eq!(sim.organisms[second].org_trust.get(&leader_id), Some(&0.05));
        assert!(sim.organisms[outsider].org_trust.is_empty());
        assert_eq!(sim.grid.get(60, 61), Tile::Campfire);
        assert_eq!(
            inventories,
            sim.organisms
                .iter()
                .take(4)
                .map(|o| (o.inv_food, o.inv_water, o.inv_wood, o.inv_stone))
                .collect::<Vec<_>>()
        );

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_first = loaded.organisms.iter().find(|o| o.id == first_id).unwrap();
        assert_eq!(loaded_first.org_trust.get(&second_id), Some(&0.05));
        assert!(loaded_first.discoveries.contains("bond_ritual"));
    }

    #[test]
    fn missing_fire_or_third_participant_hides_and_rejects_action() {
        let (mut sim, leader, first, second, outsider) = ritual_world();
        sim.grid.set(60, 61, Tile::Grass);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, leader, 60, 60, &spatial).contains(&240));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, leader, 240, 60, 60, &spatial),
            None
        );

        sim.grid.set(60, 61, Tile::Campfire);
        sim.organisms[second].alive = false;
        sim.organisms[outsider].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, leader, 60, 60, &spatial).contains(&240));
        assert!(sim.organisms[first].alive);
    }

    #[test]
    fn tired_people_are_excluded_without_blocking_a_valid_group() {
        let (mut sim, leader, tired, first, outsider) = ritual_world();
        let another = 4;
        sim.organisms[another].alive = true;
        sim.organisms[another].lineage_id = sim.organisms[leader].lineage_id.clone();
        sim.organisms[another].x = 64.0;
        sim.organisms[another].y = 60.0;
        sim.organisms[another].energy = 0.80;
        sim.organisms[tired].energy = PARTICIPANT_MIN_ENERGY - 0.01;
        sim.organisms[outsider].alive = false;
        let tired_energy = sim.organisms[tired].energy;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, leader, 240, 60, 60, &spatial).is_some());
        assert_eq!(sim.organisms[tired].energy, tired_energy);
        assert!(!sim.organisms[tired].discoveries.contains("bond_ritual"));
        assert!(sim.organisms[first].discoveries.contains("bond_ritual"));
        assert!(sim.organisms[another].discoveries.contains("bond_ritual"));
    }

    #[test]
    fn ritual_cooldown_persists_and_reopens_at_the_exact_boundary() {
        let (mut sim, leader, _, _, outsider) = ritual_world();
        sim.organisms[outsider].alive = false;
        let leader_id = sim.organisms[leader].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, leader, 240, 60, 60, &spatial).is_some());

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_leader = loaded.organisms.iter().position(|o| o.id == leader_id).unwrap();
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_leader, 60, 60, &spatial).contains(&240)
        );
        loaded.tick_count += RITUAL_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_leader, 60, 60, &spatial).contains(&240)
        );
    }
}
