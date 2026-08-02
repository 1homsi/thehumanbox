use super::super::ctx::ActionCtx;
use crate::{
    organism::organism::Organism,
    sim::{age_stage::AgeStage, simulation::Simulation, spatial::SpatialIndex},
};

const HELP_REQUEST_COOLDOWN: u64 = 180;
const HELP_REQUEST_KEY: &str = "ask_for_help";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AidKind {
    Water,
    Food,
    CarryWood,
    CarryStone,
    Reassurance,
}

#[derive(Clone, Copy, Debug)]
struct AidPlan {
    helper_idx: usize,
    kind: AidKind,
    urgency: f32,
}

fn request_ready(requester: &Organism, tick: u64) -> bool {
    requester
        .last_think_by_kind
        .get(HELP_REQUEST_KEY)
        .is_none_or(|last| tick.saturating_sub(*last) >= HELP_REQUEST_COOLDOWN)
}

fn helper_is_trusted(sim: &Simulation, requester_idx: usize, helper_idx: usize) -> bool {
    let requester = &sim.organisms[requester_idx];
    let helper = &sim.organisms[helper_idx];
    helper.lineage_id == requester.lineage_id
        || helper.friends.contains_key(&requester.id)
        || helper.org_trust.get(&requester.id).copied().unwrap_or(0.0) >= 0.45
}

fn best_aid_kind(requester: &Organism, helper: &Organism) -> Option<(AidKind, f32)> {
    if !helper.alive
        || matches!(helper.age_stage(), AgeStage::Infant)
        || helper.health < 0.50
        || helper.energy < 0.35
        || helper.hydration < 0.35
    {
        return None;
    }

    let can_receive_item = requester.carry_room() > 0;
    if requester.hydration < 0.45 && requester.inv_water == 0 && helper.inv_water > 1 && can_receive_item {
        return Some((AidKind::Water, 4.0 + (0.45 - requester.hydration)));
    }
    if requester.energy < 0.45 && requester.inv_food == 0 && helper.inv_food > 1 && can_receive_item {
        return Some((AidKind::Food, 3.5 + (0.45 - requester.energy)));
    }
    if requester.energy < 0.42 && helper.carry_room() > 0 {
        if requester.inv_wood > 0 {
            return Some((AidKind::CarryWood, 2.2 + (0.42 - requester.energy)));
        }
        if requester.inv_stone > 0 {
            return Some((AidKind::CarryStone, 2.1 + (0.42 - requester.energy)));
        }
    }
    if requester.fear_level > 0.60 || requester.loneliness > 0.70 || requester.comfort < 0.22 {
        let distress = requester
            .fear_level
            .max(requester.loneliness)
            .max(1.0 - requester.comfort);
        return Some((AidKind::Reassurance, 1.0 + distress));
    }
    None
}

fn choose_aid(sim: &Simulation, requester_idx: usize, nearby: &[usize]) -> Option<AidPlan> {
    let requester = &sim.organisms[requester_idx];
    if !request_ready(requester, sim.tick_count) {
        return None;
    }

    nearby
        .iter()
        .copied()
        .filter_map(|helper_idx| {
            if helper_idx == requester_idx || !helper_is_trusted(sim, requester_idx, helper_idx) {
                return None;
            }
            let helper = &sim.organisms[helper_idx];
            let (kind, urgency) = best_aid_kind(requester, helper)?;
            Some(AidPlan {
                helper_idx,
                kind,
                urgency,
            })
        })
        .max_by(|left, right| {
            let left_helper = &sim.organisms[left.helper_idx];
            let right_helper = &sim.organisms[right.helper_idx];
            let left_trust = left_helper.org_trust.get(&requester.id).copied().unwrap_or(0.0);
            let right_trust = right_helper.org_trust.get(&requester.id).copied().unwrap_or(0.0);
            left.urgency
                .total_cmp(&right.urgency)
                .then_with(|| left_trust.total_cmp(&right_trust))
                .then_with(|| right_helper.id.cmp(&left_helper.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, requester_idx: usize, nearby: &[usize]) -> bool {
    choose_aid(sim, requester_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, requester_idx: usize, spatial: &SpatialIndex) -> bool {
    let requester = &sim.organisms[requester_idx];
    let nearby = spatial.query(requester.x as i32, requester.y as i32, 6);
    can_apply_with_nearby(sim, requester_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(plan) = choose_aid(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no trusted person can meet this need");
        return 0.0;
    };

    let requester_id = ctx.sim.organisms[ctx.idx].id.clone();
    let requester_name = ctx.sim.organisms[ctx.idx].name.clone();
    let requester_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let helper_id = ctx.sim.organisms[plan.helper_idx].id.clone();
    let helper_name = ctx.sim.organisms[plan.helper_idx].name.clone();
    let helper_lineage = ctx.sim.organisms[plan.helper_idx].lineage_id.clone();

    let aid_description = match plan.kind {
        AidKind::Water => {
            ctx.sim.organisms[plan.helper_idx].inv_water -= 1;
            ctx.sim.organisms[ctx.idx].inv_water += 1;
            "shared drinking water"
        }
        AidKind::Food => {
            ctx.sim.organisms[plan.helper_idx].inv_food -= 1;
            ctx.sim.organisms[ctx.idx].inv_food += 1;
            "shared emergency food"
        }
        AidKind::CarryWood => {
            ctx.sim.organisms[ctx.idx].inv_wood -= 1;
            ctx.sim.organisms[plan.helper_idx].inv_wood += 1;
            "carried part of the wood load"
        }
        AidKind::CarryStone => {
            ctx.sim.organisms[ctx.idx].inv_stone -= 1;
            ctx.sim.organisms[plan.helper_idx].inv_stone += 1;
            "carried part of the stone load"
        }
        AidKind::Reassurance => {
            let requester = &mut ctx.sim.organisms[ctx.idx];
            requester.fear_level = (requester.fear_level - 0.16).max(0.0);
            requester.loneliness = (requester.loneliness - 0.18).max(0.0);
            requester.comfort = (requester.comfort + 0.12).min(1.0);
            "stayed close through distress"
        }
    };

    {
        let requester = &mut ctx.sim.organisms[ctx.idx];
        requester.mark_thought(HELP_REQUEST_KEY, ctx.tick);
        let trust = requester.org_trust.entry(helper_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.10).min(1.0);
        requester.gratitude = (requester.gratitude + 0.10).min(1.0);
        requester.hope = (requester.hope + 0.04).min(1.0);
        if requester_lineage != helper_lineage {
            requester.update_attitude(&helper_lineage, 0.03);
        }
        requester.log_life_rel(
            ctx.tick,
            "help",
            format!("{helper_name} {aid_description} when I asked for help"),
            Some(helper_id.clone()),
            Some(helper_name.clone()),
        );
    }
    {
        let helper = &mut ctx.sim.organisms[plan.helper_idx];
        let trust = helper.org_trust.entry(requester_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.05).min(1.0);
        helper.comfort = (helper.comfort + 0.04).min(1.0);
        if requester_lineage != helper_lineage {
            helper.update_attitude(&requester_lineage, 0.02);
        }
        helper.think(&format!("helping {requester_name}"), ctx.tick);
        helper.log_life_rel(
            ctx.tick,
            "help",
            format!("{aid_description} for {requester_name}"),
            Some(requester_id.clone()),
            Some(requester_name.clone()),
        );
    }

    ctx.think(&format!("receiving help from {helper_name}"));
    ctx.event("help", &format!("{helper_name} {aid_description}"));
    0.014
}

#[cfg(test)]
mod tests {
    use super::*;

    fn help_world() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0xA1D0_2290);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let requester = 0;
        let helper = 1;
        let lineage = sim.organisms[requester].lineage_id.clone();
        for (index, x) in [(requester, 80.0), (helper, 81.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 80.0;
            sim.organisms[index].age = sim.organisms[index].max_age / 2;
            sim.organisms[index].health = 0.90;
            sim.organisms[index].energy = 0.80;
            sim.organisms[index].hydration = 0.80;
        }
        sim.tick_count = 1_000;
        (sim, requester, helper)
    }

    #[test]
    fn hungry_request_moves_real_food_and_persists_the_cooldown() {
        let (mut sim, requester, helper) = help_world();
        let requester_id = sim.organisms[requester].id.clone();
        let helper_id = sim.organisms[helper].id.clone();
        sim.organisms[requester].energy = 0.20;
        sim.organisms[requester].inv_food = 0;
        sim.organisms[helper].inv_food = 3;
        let energy_before = sim.organisms[requester].energy;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, requester, 229, 80, 80, &spatial).is_some());
        assert_eq!(sim.organisms[requester].inv_food, 1);
        assert_eq!(sim.organisms[helper].inv_food, 2);
        assert_eq!(sim.organisms[requester].energy, energy_before);
        assert_eq!(sim.organisms[requester].org_trust.get(&helper_id), Some(&0.10));
        assert!(!crate::sim::actions::available_actions(&sim, requester, 80, 80, &spatial).contains(&229));

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_requester_idx = loaded
            .organisms
            .iter()
            .position(|organism| organism.id == requester_id)
            .unwrap();
        let loaded_helper_idx = loaded
            .organisms
            .iter()
            .position(|organism| organism.id == helper_id)
            .unwrap();
        let loaded_requester = &loaded.organisms[loaded_requester_idx];
        assert_eq!(loaded_requester.inv_food, 1);
        assert_eq!(
            loaded_requester.last_think_by_kind.get(HELP_REQUEST_KEY),
            Some(&1_000)
        );

        // Recreate the same need to prove the persisted timestamp actually
        // suppresses the action, then becomes eligible at the exact boundary.
        loaded.organisms[loaded_requester_idx].inv_food = 0;
        loaded.organisms[loaded_helper_idx].inv_food = 2;
        let spatial = SpatialIndex::build(&loaded.organisms, 10);
        assert!(
            !crate::sim::actions::available_actions(&loaded, loaded_requester_idx, 80, 80, &spatial)
                .contains(&229)
        );
        loaded.tick_count += HELP_REQUEST_COOLDOWN;
        assert!(
            crate::sim::actions::available_actions(&loaded, loaded_requester_idx, 80, 80, &spatial)
                .contains(&229)
        );
    }

    #[test]
    fn trusted_foreign_neighbor_can_answer_an_emergency_water_request() {
        let (mut sim, requester, helper) = help_world();
        let requester_id = sim.organisms[requester].id.clone();
        let requester_lineage = sim.organisms[requester].lineage_id.clone();
        let helper_lineage = "foreign-helper".to_string();
        sim.organisms[helper].lineage_id.clone_from(&helper_lineage);
        sim.organisms[helper].org_trust.insert(requester_id, 0.60);
        sim.organisms[requester].hydration = 0.20;
        sim.organisms[helper].inv_water = 3;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        let mut ctx = ActionCtx::new(&mut sim, requester, 80, 80, &spatial);
        assert!(apply(&mut ctx) > 0.0);
        assert_eq!(sim.organisms[requester].inv_water, 1);
        assert_eq!(sim.organisms[helper].inv_water, 2);
        assert!(sim.organisms[requester].attitude_toward(&helper_lineage) > 0.0);
        assert!(sim.organisms[helper].attitude_toward(&requester_lineage) > 0.0);
    }

    #[test]
    fn exhausted_requester_can_hand_off_a_real_load() {
        let (mut sim, requester, helper) = help_world();
        sim.organisms[requester].energy = 0.30;
        sim.organisms[requester].inv_wood = 2;
        sim.organisms[helper].inv_food = 0;
        sim.organisms[helper].inv_water = 0;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, requester, 80, 80, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert_eq!(sim.organisms[requester].inv_wood, 1);
        assert_eq!(sim.organisms[helper].inv_wood, 1);
    }

    #[test]
    fn distress_support_changes_distress_without_conjuring_inventory() {
        let (mut sim, requester, helper) = help_world();
        sim.organisms[requester].fear_level = 0.80;
        sim.organisms[requester].loneliness = 0.80;
        let inventory_before = sim.organisms[requester].carry_load() + sim.organisms[helper].carry_load();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, requester, 80, 80, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[requester].fear_level < 0.80);
        assert!(sim.organisms[requester].loneliness < 0.80);
        assert_eq!(
            sim.organisms[requester].carry_load() + sim.organisms[helper].carry_load(),
            inventory_before
        );
    }

    #[test]
    fn action_is_hidden_and_forced_apply_rejected_without_real_aid() {
        let (mut sim, requester, helper) = help_world();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, requester, 80, 80, &spatial).contains(&229));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, requester, 229, 80, 80, &spatial),
            None
        );

        sim.organisms[requester].energy = 0.20;
        sim.organisms[helper].inv_food = 3;
        sim.organisms[helper].health = 0.20;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, requester, 80, 80, &spatial).contains(&229));
    }
}
