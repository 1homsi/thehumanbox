use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const BURDEN_COOLDOWN: u64 = 90;
const MIN_LOAD_GAP: u32 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Material {
    Wood,
    Stone,
}

#[derive(Clone, Copy, Debug)]
struct BurdenPlan {
    partner_idx: usize,
    source_idx: usize,
    receiver_idx: usize,
    material: Material,
    load_gap: u32,
}

fn cooldown_key(other_id: &str) -> String {
    format!("share_burden:{other_id}")
}

fn pair_ready(sim: &Simulation, actor_idx: usize, partner_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let partner = &sim.organisms[partner_idx];
    let actor_key = cooldown_key(&partner.id);
    let partner_key = cooldown_key(&actor.id);
    actor
        .last_think_by_kind
        .get(&actor_key)
        .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= BURDEN_COOLDOWN)
        && partner
            .last_think_by_kind
            .get(&partner_key)
            .is_none_or(|last| sim.tick_count.saturating_sub(*last) >= BURDEN_COOLDOWN)
}

fn is_cooperative_pair(sim: &Simulation, actor_idx: usize, partner_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let partner = &sim.organisms[partner_idx];
    actor.lineage_id == partner.lineage_id
        || actor.partner_id.as_deref() == Some(partner.id.as_str())
        || actor.friends.contains_key(&partner.id)
        || partner.friends.contains_key(&actor.id)
        || (actor.org_trust.get(&partner.id).copied().unwrap_or(0.0) >= 0.50
            && partner.org_trust.get(&actor.id).copied().unwrap_or(0.0) >= 0.50)
}

fn material_to_transfer(source: &crate::organism::organism::Organism) -> Option<Material> {
    match (source.inv_stone, source.inv_wood) {
        (0, 0) => None,
        (stone, wood) if stone >= wood => Some(Material::Stone),
        _ => Some(Material::Wood),
    }
}

fn plan_with_partner(sim: &Simulation, actor_idx: usize, partner_idx: usize) -> Option<BurdenPlan> {
    if actor_idx == partner_idx
        || !sim.organisms[partner_idx].alive
        || !is_cooperative_pair(sim, actor_idx, partner_idx)
        || !pair_ready(sim, actor_idx, partner_idx)
    {
        return None;
    }

    let actor = &sim.organisms[actor_idx];
    let partner = &sim.organisms[partner_idx];
    let actor_load = actor.carry_load();
    let partner_load = partner.carry_load();
    let (source_idx, receiver_idx, load_gap) = if actor_load >= partner_load.saturating_add(MIN_LOAD_GAP) {
        (actor_idx, partner_idx, actor_load - partner_load)
    } else if partner_load >= actor_load.saturating_add(MIN_LOAD_GAP) {
        (partner_idx, actor_idx, partner_load - actor_load)
    } else {
        return None;
    };
    if sim.organisms[receiver_idx].carry_room() == 0 {
        return None;
    }
    let material = material_to_transfer(&sim.organisms[source_idx])?;
    Some(BurdenPlan {
        partner_idx,
        source_idx,
        receiver_idx,
        material,
        load_gap,
    })
}

fn choose_plan(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<BurdenPlan> {
    let actor = &sim.organisms[actor_idx];
    nearby
        .iter()
        .copied()
        .filter_map(|partner_idx| {
            let partner = &sim.organisms[partner_idx];
            if (partner.x - actor.x).abs() + (partner.y - actor.y).abs() > 6.0 {
                return None;
            }
            plan_with_partner(sim, actor_idx, partner_idx)
        })
        .max_by(|left, right| {
            let left_partner = &sim.organisms[left.partner_idx];
            let right_partner = &sim.organisms[right.partner_idx];
            let left_distance = (left_partner.x - actor.x).abs() + (left_partner.y - actor.y).abs();
            let right_distance = (right_partner.x - actor.x).abs() + (right_partner.y - actor.y).abs();
            left.load_gap
                .cmp(&right.load_gap)
                .then_with(|| right_distance.total_cmp(&left_distance))
                .then_with(|| right_partner.id.cmp(&left_partner.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_plan(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(plan) = choose_plan(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("nearby loads are already balanced or nobody has room");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let partner_id = ctx.sim.organisms[plan.partner_idx].id.clone();
    let partner_name = ctx.sim.organisms[plan.partner_idx].name.clone();
    let partner_lineage = ctx.sim.organisms[plan.partner_idx].lineage_id.clone();
    let source_name = ctx.sim.organisms[plan.source_idx].name.clone();
    let receiver_name = ctx.sim.organisms[plan.receiver_idx].name.clone();
    let material_name = match plan.material {
        Material::Wood => {
            ctx.sim.organisms[plan.source_idx].inv_wood -= 1;
            ctx.sim.organisms[plan.receiver_idx].inv_wood += 1;
            "wood"
        }
        Material::Stone => {
            ctx.sim.organisms[plan.source_idx].inv_stone -= 1;
            ctx.sim.organisms[plan.receiver_idx].inv_stone += 1;
            "stone"
        }
    };

    ctx.sim.organisms[ctx.idx]
        .last_think_by_kind
        .insert(cooldown_key(&partner_id), ctx.tick);
    ctx.sim.organisms[plan.partner_idx]
        .last_think_by_kind
        .insert(cooldown_key(&actor_id), ctx.tick);
    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(partner_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.05).min(1.0);
        actor.comfort = (actor.comfort + 0.04).min(1.0);
        actor.gratitude = (actor.gratitude + 0.03).min(1.0);
        if actor_lineage != partner_lineage {
            actor.update_attitude(&partner_lineage, 0.02);
        }
        actor.log_life_rel(
            ctx.tick,
            "cooperation",
            format!("balanced a {material_name} load with {partner_name}"),
            Some(partner_id.clone()),
            Some(partner_name.clone()),
        );
    }
    {
        let partner = &mut ctx.sim.organisms[plan.partner_idx];
        let trust = partner.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.05).min(1.0);
        partner.comfort = (partner.comfort + 0.04).min(1.0);
        partner.gratitude = (partner.gratitude + 0.03).min(1.0);
        if actor_lineage != partner_lineage {
            partner.update_attitude(&actor_lineage, 0.02);
        }
        partner.think(
            &format!("sharing the {material_name} load with {actor_name}"),
            ctx.tick,
        );
        partner.log_life_rel(
            ctx.tick,
            "cooperation",
            format!("balanced a {material_name} load with {actor_name}"),
            Some(actor_id),
            Some(actor_name.clone()),
        );
    }

    ctx.think(&format!("balancing the load with {partner_name}"));
    ctx.event(
        "cooperation",
        &format!("{receiver_name} took one {material_name} from {source_name}"),
    );
    0.010
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Sex;

    fn burden_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0xB04D_2300);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let helper = 1;
        let less_useful = 2;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 100.0), (helper, 101.0), (less_useful, 102.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 100.0;
        }
        sim.tick_count = 900;
        (sim, actor, helper, less_useful)
    }

    fn total_materials(sim: &Simulation, indices: &[usize]) -> u32 {
        indices
            .iter()
            .map(|&index| sim.organisms[index].inv_wood as u32 + sim.organisms[index].inv_stone as u32)
            .sum()
    }

    #[test]
    fn heaviest_load_is_balanced_toward_the_most_useful_helper_without_loss() {
        let (mut sim, actor, helper, less_useful) = burden_world();
        let actor_id = sim.organisms[actor].id.clone();
        let helper_id = sim.organisms[helper].id.clone();
        sim.organisms[actor].inv_stone = 4;
        sim.organisms[actor].inv_wood = 2;
        sim.organisms[less_useful].inv_wood = 4;
        let total_before = total_materials(&sim, &[actor, helper, less_useful]);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 230, 100, 100, &spatial).is_some());
        assert_eq!(sim.organisms[actor].inv_stone, 3);
        assert_eq!(sim.organisms[helper].inv_stone, 1);
        assert_eq!(sim.organisms[less_useful].inv_wood, 4);
        assert_eq!(total_materials(&sim, &[actor, helper, less_useful]), total_before);
        assert_eq!(sim.organisms[helper].org_trust.get(&actor_id), Some(&0.05));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        assert_eq!(loaded_actor.inv_stone, 3);
        assert_eq!(
            loaded_actor.last_think_by_kind.get(&cooldown_key(&helper_id)),
            Some(&900)
        );
    }

    #[test]
    fn actor_can_take_material_from_an_overloaded_neighbor() {
        let (mut sim, actor, helper, less_useful) = burden_world();
        sim.organisms[less_useful].alive = false;
        sim.organisms[helper].inv_wood = 5;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 100, 100, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert_eq!(sim.organisms[actor].inv_wood, 1);
        assert_eq!(sim.organisms[helper].inv_wood, 4);
    }

    #[test]
    fn full_receiver_blocks_transfer_and_forced_action() {
        let (mut sim, actor, helper, less_useful) = burden_world();
        sim.organisms[less_useful].alive = false;
        sim.organisms[actor].sex = Sex::Male;
        sim.organisms[actor].traits.resilience = 0.90;
        sim.organisms[actor].inv_stone = 12;
        sim.organisms[helper].sex = Sex::Female;
        sim.organisms[helper].traits.resilience = 0.10;
        sim.organisms[helper].inv_food = sim.organisms[helper].carry_max() as u8;
        let total_before = total_materials(&sim, &[actor, helper]);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, actor, 100, 100, &spatial).contains(&230));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 230, 100, 100, &spatial),
            None
        );
        assert_eq!(total_materials(&sim, &[actor, helper]), total_before);
    }

    #[test]
    fn pair_cooldown_has_an_exact_boundary() {
        let (mut sim, actor, helper, less_useful) = burden_world();
        sim.organisms[less_useful].alive = false;
        sim.organisms[actor].inv_stone = 5;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 230, 100, 100, &spatial).is_some());
        assert!(!crate::sim::actions::available_actions(&sim, actor, 100, 100, &spatial).contains(&230));
        assert!(!crate::sim::actions::available_actions(&sim, helper, 101, 100, &spatial).contains(&230));

        sim.tick_count += BURDEN_COOLDOWN;
        assert!(crate::sim::actions::available_actions(&sim, actor, 100, 100, &spatial).contains(&230));
    }

    #[test]
    fn mutually_trusted_foreign_friends_can_share_a_load() {
        let (mut sim, actor, helper, less_useful) = burden_world();
        sim.organisms[less_useful].alive = false;
        let actor_id = sim.organisms[actor].id.clone();
        let helper_id = sim.organisms[helper].id.clone();
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let helper_lineage = "foreign-helper".to_string();
        sim.organisms[helper].lineage_id.clone_from(&helper_lineage);
        sim.organisms[actor].org_trust.insert(helper_id, 0.60);
        sim.organisms[helper].org_trust.insert(actor_id, 0.60);
        sim.organisms[actor].inv_wood = 4;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 100, 100, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[actor].attitude_toward(&helper_lineage) > 0.0);
        assert!(sim.organisms[helper].attitude_toward(&actor_lineage) > 0.0);
    }
}
