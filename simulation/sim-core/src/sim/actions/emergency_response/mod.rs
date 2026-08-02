pub mod airway_open;
pub mod apply_tourniquet;
pub mod arrive_scene;
pub mod backboard_carry;
pub mod breach_door;
pub mod breach_wall;
pub mod breach_window;
pub mod brief_team;
pub mod call_emergency;
pub mod chair_carry;
pub mod chest_compression;
pub mod climb_ladder;
pub mod debrief_team;
pub mod defibrillate_aed;
pub mod document_call;
pub mod establish_command;
pub mod evacuate_patient;
pub mod exterior_attack;
pub mod extinguish_small_fire;
pub mod firefighter_carry;
pub mod interior_attack;
pub mod investigate_origin;
pub mod lay_ladder;
pub mod mark_perimeter;
pub mod overhaul_post_fire;
pub mod pressure_dressing;
pub mod primary_search;
pub mod rapid_intervention;
pub mod recovery_position;
pub mod report_crime;
pub mod report_fire;
pub mod report_flood;
pub mod report_injury;
pub mod rescue_breath;
pub mod rescue_window;
pub mod roof_op;
pub mod room_clear;
pub mod secondary_search;
pub mod secure_scene;
pub mod splint_fracture;
pub mod start_iv;
pub mod stretcher_carry;
pub mod triage_assign;
pub mod triage_patient;
pub mod triage_priority;
pub mod triage_recheck;
pub mod triage_record;
pub mod vent_smoke;
pub mod ventilate_after_fire;
pub mod wrap_burn;

use super::ctx::ActionCtx;
use crate::{organism::decision_bias::fire_response_target, sim::simulation::Simulation, world::tiles::Tile};

pub(crate) const REAL_EMERGENCY_ACTIONS: [usize; 3] = [4621, 4654, 4665];
pub(crate) const FIRE_RESPONSE_TICKS: u64 = 240;
const FIRE_REPORT_RADIUS: i32 = 12;

pub(crate) fn is_real_action(action: usize) -> bool {
    REAL_EMERGENCY_ACTIONS.contains(&action)
}

fn capable_responder(sim: &Simulation, idx: usize) -> bool {
    sim.organisms.get(idx).is_some_and(|organism| {
        organism.alive
            && organism.age_stage().can_combat()
            && !organism.pregnant
            && organism.energy > 0.45
            && organism.health > 0.50
    })
}

pub(crate) fn nearest_fire(sim: &Simulation, x: i32, y: i32, radius: i32) -> Option<(i32, i32)> {
    let mut best = None;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let distance = dx.abs() + dy.abs();
            if distance > radius
                || sim.grid.get(x + dx, y + dy) != Tile::Fire
                || sim.grid.fire_intensity(x + dx, y + dy) <= 0.0
            {
                continue;
            }
            let candidate = (distance, y + dy, x + dx);
            if best.is_none_or(|current: (i32, i32, i32)| candidate < current) {
                best = Some(candidate);
            }
        }
    }
    best.map(|(_, fire_y, fire_x)| (fire_x, fire_y))
}

fn existing_responder(sim: &Simulation, idx: usize, target: (i32, i32)) -> bool {
    let Some(actor) = sim.organisms.get(idx) else {
        return false;
    };
    sim.organisms.iter().enumerate().any(|(other_idx, other)| {
        other_idx != idx
            && other.alive
            && other.lineage_id == actor.lineage_id
            && other.age_stage().can_combat()
            && !other.pregnant
            && other.energy > 0.45
            && other.health > 0.50
            && other.inv_water > 0
            && sim.tick_count < other.directive_until
            && fire_response_target(&other.directive).is_some_and(|other_target| {
                (other_target.0 - target.0).abs() + (other_target.1 - target.1).abs() <= 3
            })
    })
}

pub(crate) fn report_target(sim: &Simulation, idx: usize, x: i32, y: i32) -> Option<(i32, i32)> {
    if !capable_responder(sim, idx) || sim.organisms[idx].inv_water == 0 {
        return None;
    }
    if sim.tick_count < sim.organisms[idx].directive_until
        && fire_response_target(&sim.organisms[idx].directive).is_some()
    {
        return None;
    }
    let target = nearest_fire(sim, x, y, FIRE_REPORT_RADIUS)?;
    (!existing_responder(sim, idx, target)).then_some(target)
}

pub(crate) fn suppression_target(sim: &Simulation, idx: usize, x: i32, y: i32) -> Option<(i32, i32)> {
    if !capable_responder(sim, idx) || sim.organisms[idx].inv_water == 0 {
        return None;
    }
    if let Some(target) = fire_response_target(&sim.organisms[idx].directive) {
        if sim.tick_count < sim.organisms[idx].directive_until
            && sim.grid.get(target.0, target.1) == Tile::Fire
            && (target.0 - x).abs() + (target.1 - y).abs() <= 2
        {
            return Some(target);
        }
    }
    nearest_fire(sim, x, y, 2)
}

pub(crate) fn overhaul_target(sim: &Simulation, idx: usize, x: i32, y: i32) -> Option<(i32, i32)> {
    let organism = sim.organisms.get(idx).filter(|organism| organism.alive)?;
    let target = fire_response_target(&organism.directive)?;
    (sim.tick_count < organism.directive_until
        && sim.grid.get(target.0, target.1) == Tile::Ash
        && (target.0 - x).abs() + (target.1 - y).abs() <= 2)
        .then_some(target)
}

pub(crate) fn emergency_reflex_action(sim: &Simulation, idx: usize, x: i32, y: i32) -> Option<usize> {
    if suppression_target(sim, idx, x, y).is_some() {
        Some(4654)
    } else if overhaul_target(sim, idx, x, y).is_some() {
        Some(4665)
    } else if report_target(sim, idx, x, y).is_some() {
        Some(4621)
    } else {
        None
    }
}

pub(crate) fn action_is_possible(sim: &Simulation, idx: usize, action: usize, x: i32, y: i32) -> bool {
    match action {
        4621 => report_target(sim, idx, x, y).is_some(),
        4654 => suppression_target(sim, idx, x, y).is_some(),
        4665 => overhaul_target(sim, idx, x, y).is_some(),
        4620..=4669 => false,
        _ => true,
    }
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        4620 => call_emergency::apply(ctx),
        4621 => report_fire::apply(ctx),
        4622 => report_flood::apply(ctx),
        4623 => report_injury::apply(ctx),
        4624 => report_crime::apply(ctx),
        4625 => arrive_scene::apply(ctx),
        4626 => secure_scene::apply(ctx),
        4627 => mark_perimeter::apply(ctx),
        4628 => establish_command::apply(ctx),
        4629 => brief_team::apply(ctx),
        4630 => triage_patient::apply(ctx),
        4631 => triage_priority::apply(ctx),
        4632 => triage_assign::apply(ctx),
        4633 => triage_record::apply(ctx),
        4634 => triage_recheck::apply(ctx),
        4635 => start_iv::apply(ctx),
        4636 => splint_fracture::apply(ctx),
        4637 => wrap_burn::apply(ctx),
        4638 => airway_open::apply(ctx),
        4639 => chest_compression::apply(ctx),
        4640 => rescue_breath::apply(ctx),
        4641 => defibrillate_aed::apply(ctx),
        4642 => apply_tourniquet::apply(ctx),
        4643 => pressure_dressing::apply(ctx),
        4644 => recovery_position::apply(ctx),
        4645 => evacuate_patient::apply(ctx),
        4646 => stretcher_carry::apply(ctx),
        4647 => chair_carry::apply(ctx),
        4648 => firefighter_carry::apply(ctx),
        4649 => backboard_carry::apply(ctx),
        4650 => primary_search::apply(ctx),
        4651 => secondary_search::apply(ctx),
        4652 => room_clear::apply(ctx),
        4653 => rapid_intervention::apply(ctx),
        4654 => extinguish_small_fire::apply(ctx),
        4655 => vent_smoke::apply(ctx),
        4656 => breach_door::apply(ctx),
        4657 => breach_window::apply(ctx),
        4658 => breach_wall::apply(ctx),
        4659 => lay_ladder::apply(ctx),
        4660 => climb_ladder::apply(ctx),
        4661 => rescue_window::apply(ctx),
        4662 => roof_op::apply(ctx),
        4663 => interior_attack::apply(ctx),
        4664 => exterior_attack::apply(ctx),
        4665 => overhaul_post_fire::apply(ctx),
        4666 => ventilate_after_fire::apply(ctx),
        4667 => investigate_origin::apply(ctx),
        4668 => debrief_team::apply(ctx),
        4669 => document_call::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        organism::decision_bias::fire_response_target,
        organism::organism::Organism,
        sim::{actions::try_apply, spatial::SpatialIndex},
    };

    fn responder(seed: u64, x: i32, y: i32) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(1);
        for tile_y in y - FIRE_REPORT_RADIUS - 2..=y + FIRE_REPORT_RADIUS + 2 {
            for tile_x in x - FIRE_REPORT_RADIUS - 2..=x + FIRE_REPORT_RADIUS + 2 {
                sim.grid.set(tile_x, tile_y, Tile::Grass);
            }
        }
        let actor = &mut sim.organisms[0];
        actor.alive = true;
        actor.age = actor.max_age / 2;
        actor.pregnant = false;
        actor.energy = 1.0;
        actor.health = 1.0;
        actor.hydration = 1.0;
        actor.x = x as f32;
        actor.y = y as f32;
        actor.inv_water = 2;
        sim
    }

    fn apply_action(sim: &mut Simulation, action: usize, x: i32, y: i32) -> Option<f32> {
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        try_apply(sim, 0, action, x, y, &spatial)
    }

    #[test]
    fn responder_claims_saved_fire_then_spends_one_real_water_and_overhauls_once() {
        let (x, y) = (180, 140);
        let fire = (x + 8, y);
        let mut sim = responder(0xF1A_E101, x, y);
        sim.grid.set(fire.0, fire.1, Tile::Fire);
        *sim.grid.fire_intensity_mut(fire.0, fire.1) = 1.0;

        let available =
            crate::sim::actions::available_actions(&sim, 0, x, y, &SpatialIndex::build(&sim.organisms, 10));
        assert!(available.contains(&4621));
        assert!(!available.contains(&4654));
        assert!(apply_action(&mut sim, 4621, x, y).is_some());
        assert_eq!(fire_response_target(&sim.organisms[0].directive), Some(fire));
        assert_eq!(sim.organisms[0].inv_water, 2);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert_eq!(fire_response_target(&loaded.organisms[0].directive), Some(fire));
        assert_eq!(loaded.grid.get(fire.0, fire.1), Tile::Fire);

        sim.organisms[0].x = (fire.0 - 1) as f32;
        sim.organisms[0].y = fire.1 as f32;
        let health_before = sim.organisms[0].health;
        assert!(apply_action(&mut sim, 4654, fire.0 - 1, fire.1).is_some());
        assert_eq!(sim.organisms[0].inv_water, 1);
        assert!(sim.organisms[0].health < health_before);
        assert_eq!(sim.grid.get(fire.0, fire.1), Tile::Ash);
        assert_eq!(sim.grid.fire_intensity(fire.0, fire.1), 0.0);
        assert!(sim.organisms[0].discoveries.contains("firefighting"));
        assert!(apply_action(&mut sim, 4654, fire.0 - 1, fire.1).is_none());
        assert_eq!(sim.organisms[0].inv_water, 1);

        assert!(apply_action(&mut sim, 4665, fire.0 - 1, fire.1).is_some());
        assert!(sim.organisms[0].directive.is_empty());
        assert_eq!(sim.organisms[0].directive_until, 0);
        assert_eq!(sim.organisms[0].wander_target, None);
        assert!(sim.organisms[0]
            .danger_memory
            .get(&fire)
            .is_some_and(|danger| *danger >= 0.90));
        assert!(apply_action(&mut sim, 4665, fire.0 - 1, fire.1).is_none());
    }

    #[test]
    fn one_lineage_assigns_only_one_responder_to_the_same_fire_front() {
        let (x, y) = (200, 150);
        let fire = (x + 6, y);
        let mut sim = responder(0xF1A_E102, x, y);
        let first = &sim.organisms[0];
        let mut second = Organism::new(
            "second-responder".into(),
            "Second".into(),
            (x + 1) as f32,
            y as f32,
            0,
            String::new(),
            first.lineage_id.clone(),
            first.max_age,
            first.traits.clone(),
        );
        second.age = second.max_age / 2;
        second.energy = 1.0;
        second.health = 1.0;
        second.hydration = 1.0;
        second.inv_water = 2;
        sim.organisms.push(second);
        sim.grid.set(fire.0, fire.1, Tile::Fire);
        *sim.grid.fire_intensity_mut(fire.0, fire.1) = 1.0;

        assert_eq!(report_target(&sim, 0, x, y), Some(fire));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, 0, 4621, x, y, &spatial).is_some());
        assert_eq!(report_target(&sim, 1, x + 1, y), None);
    }

    #[test]
    fn generated_emergency_stubs_and_unfunded_suppression_stay_unavailable() {
        let (x, y) = (220, 160);
        let mut sim = responder(0xF1A_E103, x, y);
        sim.grid.set(x + 1, y, Tile::Fire);
        *sim.grid.fire_intensity_mut(x + 1, y) = 1.0;
        sim.organisms[0].inv_water = 0;

        for action in 4620..=4669 {
            if !REAL_EMERGENCY_ACTIONS.contains(&action) {
                assert!(
                    apply_action(&mut sim, action, x, y).is_none(),
                    "stub emergency action {action} must stay hidden"
                );
            }
        }
        assert!(apply_action(&mut sim, 4621, x, y).is_none());
        assert!(apply_action(&mut sim, 4654, x, y).is_none());
        assert_eq!(sim.grid.get(x + 1, y), Tile::Fire);
    }
}
