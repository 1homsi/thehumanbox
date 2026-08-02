use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const HUNGRY_ENERGY: f32 = 0.65;

fn recipient_is_close_relationship(sim: &Simulation, actor_idx: usize, recipient_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let recipient = &sim.organisms[recipient_idx];
    recipient.lineage_id == actor.lineage_id
        || actor.friends.contains_key(&recipient.id)
        || actor.org_trust.get(&recipient.id).copied().unwrap_or(0.0) >= 0.55
}

fn choose_recipient(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    if actor.inv_food == 0 {
        return None;
    }
    nearby
        .iter()
        .copied()
        .filter(|&index| {
            let recipient = &sim.organisms[index];
            index != actor_idx
                && recipient.alive
                && recipient.energy < HUNGRY_ENERGY
                && recipient.carry_room() > 0
                && recipient_is_close_relationship(sim, actor_idx, index)
                && (recipient.x - actor.x).abs() + (recipient.y - actor.y).abs() <= 6.0
        })
        .min_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_orphan =
                left_org.orphaned_tick > 0 && sim.tick_count.saturating_sub(left_org.orphaned_tick) < 600;
            let right_orphan =
                right_org.orphaned_tick > 0 && sim.tick_count.saturating_sub(right_org.orphaned_tick) < 600;
            let left_trust = actor.org_trust.get(&left_org.id).copied().unwrap_or(0.0);
            let right_trust = actor.org_trust.get(&right_org.id).copied().unwrap_or(0.0);
            let left_distance = (left_org.x - actor.x).abs() + (left_org.y - actor.y).abs();
            let right_distance = (right_org.x - actor.x).abs() + (right_org.y - actor.y).abs();
            right_orphan
                .cmp(&left_orphan)
                .then_with(|| left_org.energy.total_cmp(&right_org.energy))
                .then_with(|| left_org.inv_food.cmp(&right_org.inv_food))
                .then_with(|| right_trust.total_cmp(&left_trust))
                .then_with(|| left_distance.total_cmp(&right_distance))
                .then_with(|| left_org.id.cmp(&right_org.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_recipient(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(recipient_idx) = choose_recipient(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no hungry loved one can carry this food");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let recipient_id = ctx.sim.organisms[recipient_idx].id.clone();
    let recipient_name = ctx.sim.organisms[recipient_idx].name.clone();
    let recipient_lineage = ctx.sim.organisms[recipient_idx].lineage_id.clone();

    // Selection validates both stock and capacity before either inventory is
    // touched. This is a transfer, not a free energy heal or a destroyed item.
    ctx.sim.organisms[ctx.idx].inv_food -= 1;
    ctx.sim.organisms[recipient_idx].inv_food += 1;
    ctx.sim.organisms[ctx.idx].last_fed_kin = ctx.tick;

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(recipient_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        actor.comfort = (actor.comfort + 0.04).min(1.0);
        if recipient_lineage != actor_lineage {
            actor.update_attitude(&recipient_lineage, 0.02);
        }
    }
    {
        let recipient = &mut ctx.sim.organisms[recipient_idx];
        let trust = recipient.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.12).min(1.0);
        recipient.gratitude = (recipient.gratitude + 0.10).min(1.0);
        recipient.hope = (recipient.hope + 0.04).min(1.0);
        recipient.joy_ticks = recipient.joy_ticks.saturating_add(90).min(1_200);
        if recipient_lineage != actor_lineage {
            recipient.update_attitude(&actor_lineage, 0.04);
        }
        recipient.think(&format!("received food from {actor_name}"), ctx.tick);
        recipient.log_life_rel(
            ctx.tick,
            "gift",
            format!("received food from {actor_name} while hungry"),
            Some(actor_id.clone()),
            Some(actor_name.clone()),
        );
    }

    const FRIEND_THRESHOLD: f32 = 0.55;
    if ctx.sim.organisms[ctx.idx]
        .org_trust
        .get(&recipient_id)
        .copied()
        .unwrap_or(0.0)
        >= FRIEND_THRESHOLD
    {
        ctx.sim.organisms[ctx.idx].add_friend(&recipient_id, &recipient_name, ctx.tick);
    }
    if ctx.sim.organisms[recipient_idx]
        .org_trust
        .get(&actor_id)
        .copied()
        .unwrap_or(0.0)
        >= FRIEND_THRESHOLD
    {
        ctx.sim.organisms[recipient_idx].add_friend(&actor_id, &actor_name, ctx.tick);
    }

    ctx.sim.organisms[ctx.idx].log_life_rel(
        ctx.tick,
        "gift",
        format!("gave food to hungry {recipient_name}"),
        Some(recipient_id),
        Some(recipient_name.clone()),
    );
    ctx.think(&format!("giving food to {recipient_name}"));
    ctx.event("gift", &format!("gave food to hungry {recipient_name}"));
    0.014
}

#[cfg(test)]
mod tests {
    use super::*;

    fn food_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0xF00D_61F7);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let well_fed = 1;
        let hungry = 2;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 100.0), (well_fed, 101.0), (hungry, 102.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 100.0;
        }
        sim.organisms[actor].inv_food = 2;
        sim.organisms[well_fed].energy = 0.90;
        sim.organisms[hungry].energy = 0.20;
        sim.tick_count = 700;
        (sim, actor, well_fed, hungry)
    }

    #[test]
    fn gift_moves_food_to_the_hungriest_person_and_records_care() {
        let (mut sim, actor, well_fed, hungry) = food_world();
        let actor_id = sim.organisms[actor].id.clone();
        let hungry_id = sim.organisms[hungry].id.clone();
        let hungry_energy = sim.organisms[hungry].energy;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 100, 100, &spatial);

        assert!(apply(&mut ctx) > 0.0);

        assert_eq!(sim.organisms[actor].inv_food, 1);
        assert_eq!(sim.organisms[hungry].inv_food, 1);
        assert_eq!(sim.organisms[well_fed].inv_food, 0);
        assert_eq!(sim.organisms[hungry].energy, hungry_energy);
        assert_eq!(sim.organisms[hungry].org_trust.get(&actor_id), Some(&0.12));
        assert!(sim.organisms[hungry]
            .life_log
            .iter()
            .any(|entry| entry.text.contains("received food")));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_hungry = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == hungry_id)
            .unwrap();
        assert_eq!(loaded_hungry.inv_food, 1);
        assert_eq!(loaded_hungry.org_trust.get(&actor_id), Some(&0.12));
    }

    #[test]
    fn trusted_foreign_friend_can_receive_food_and_improve_relations() {
        let (mut sim, actor, well_fed, hungry) = food_world();
        sim.organisms[well_fed].alive = false;
        let actor_lineage = sim.organisms[actor].lineage_id.clone();
        let foreign_lineage = "foreign-friends".to_string();
        let hungry_id = sim.organisms[hungry].id.clone();
        sim.organisms[hungry].lineage_id.clone_from(&foreign_lineage);
        sim.organisms[actor].friends.insert(hungry_id, "Friend".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 100, 100, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[actor].attitude_toward(&foreign_lineage) > 0.0);
        assert!(sim.organisms[hungry].attitude_toward(&actor_lineage) > 0.0);
    }

    #[test]
    fn action_is_hidden_and_rejected_when_no_transfer_can_succeed() {
        let (mut sim, actor, _well_fed, hungry) = food_world();
        sim.organisms[actor].inv_food = 0;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let actions = crate::sim::actions::available_actions(&sim, actor, 100, 100, &spatial);
        assert!(!actions.contains(&226));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 226, 100, 100, &spatial),
            None
        );

        sim.organisms[actor].inv_food = 1;
        sim.organisms[hungry].inv_food = 9;
        sim.organisms[hungry].inv_water = 9;
        sim.organisms[hungry].inv_wood = 9;
        sim.organisms[hungry].inv_stone = 9;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 100, 100, &spatial).contains(&226));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 226, 100, 100, &spatial),
            None
        );
        assert_eq!(sim.organisms[actor].inv_food, 1);
    }
}
