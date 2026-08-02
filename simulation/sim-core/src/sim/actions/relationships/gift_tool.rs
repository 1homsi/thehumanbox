use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

fn choose_recipient(sim: &Simulation, actor_idx: usize, nearby: &[usize], tool: &str) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    nearby
        .iter()
        .copied()
        .filter(|&index| {
            let recipient = &sim.organisms[index];
            index != actor_idx
                && recipient.alive
                && recipient.lineage_id == actor.lineage_id
                && recipient.tools.get(tool).copied().unwrap_or(0) < u8::MAX
                && (recipient.x - actor.x).abs() + (recipient.y - actor.y).abs() <= 6.0
        })
        .min_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_count = left_org.tools.get(tool).copied().unwrap_or(0);
            let right_count = right_org.tools.get(tool).copied().unwrap_or(0);
            let left_trust = actor.org_trust.get(&left_org.id).copied().unwrap_or(0.0);
            let right_trust = actor.org_trust.get(&right_org.id).copied().unwrap_or(0.0);
            let left_distance = (left_org.x - actor.x).abs() + (left_org.y - actor.y).abs();
            let right_distance = (right_org.x - actor.x).abs() + (right_org.y - actor.y).abs();
            left_count
                .cmp(&right_count)
                .then_with(|| right_trust.total_cmp(&left_trust))
                .then_with(|| left_distance.total_cmp(&right_distance))
                .then_with(|| left_org.id.cmp(&right_org.id))
        })
}

fn transfer_plan(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<(String, usize)> {
    sim.organisms[actor_idx]
        .tools
        .iter()
        .filter(|(_, count)| **count > 0)
        .filter_map(|(tool, count)| {
            choose_recipient(sim, actor_idx, nearby, tool).map(|recipient| (tool.as_str(), *count, recipient))
        })
        .max_by(|left, right| left.1.cmp(&right.1).then_with(|| right.0.cmp(left.0)))
        .map(|(tool, _, recipient)| (tool.to_string(), recipient))
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    transfer_plan(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((tool, recipient_idx)) = transfer_plan(ctx.sim, ctx.idx, &ctx.kin) else {
        ctx.think("no useful tool to offer nearby kin");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let recipient_id = ctx.sim.organisms[recipient_idx].id.clone();
    let recipient_name = ctx.sim.organisms[recipient_idx].name.clone();

    // Validate the entire plan before mutating either inventory so saturation
    // or missing recipients can never destroy an item.
    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let count = actor
            .tools
            .get_mut(&tool)
            .expect("validated gift tool disappeared before commit");
        *count -= 1;
        if *count == 0 {
            actor.tools.remove(&tool);
        }
        let trust = actor.org_trust.entry(recipient_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        actor.comfort = (actor.comfort + 0.03).min(1.0);
    }
    {
        let recipient = &mut ctx.sim.organisms[recipient_idx];
        let count = recipient.tools.entry(tool.clone()).or_insert(0);
        *count += 1;
        let trust = recipient.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.12).min(1.0);
        recipient.comfort = (recipient.comfort + 0.08).min(1.0);
        recipient.gratitude = (recipient.gratitude + 0.08).min(1.0);
        recipient.joy_ticks = recipient.joy_ticks.saturating_add(90).min(1_200);
        recipient.think(&format!("received {tool} from {actor_name}"), ctx.tick);
        recipient.log_life_rel(
            ctx.tick,
            "gift",
            format!("received {tool} from {actor_name}"),
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
        format!("gave {tool} to {recipient_name}"),
        Some(recipient_id),
        Some(recipient_name.clone()),
    );
    ctx.think(&format!("gifting {tool} to {recipient_name}"));
    ctx.event("bond", &format!("gave {recipient_name} a {tool}"));
    0.010
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;

    fn gift_world() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0x61F7_7001);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let recipient = 1;
        let lineage = sim.organisms[actor].lineage_id.clone();
        sim.organisms[actor].alive = true;
        sim.organisms[recipient].alive = true;
        sim.organisms[recipient].lineage_id = lineage;
        sim.organisms[actor].x = 90.0;
        sim.organisms[actor].y = 90.0;
        sim.organisms[recipient].x = 91.0;
        sim.organisms[recipient].y = 90.0;
        sim.tick_count = 600;
        (sim, actor, recipient)
    }

    #[test]
    fn gift_transfers_a_real_tool_without_consuming_raw_wood() {
        let (mut sim, actor, recipient) = gift_world();
        let actor_id = sim.organisms[actor].id.clone();
        let recipient_id = sim.organisms[recipient].id.clone();
        sim.organisms[actor].inv_wood = 4;
        sim.organisms[actor].tools.insert("stone_axe".into(), 2);
        sim.organisms[actor].org_trust.insert(recipient_id.clone(), 0.52);
        sim.organisms[recipient].org_trust.insert(actor_id.clone(), 0.44);

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 90, 90, &spatial);
        assert!(apply(&mut ctx) > 0.0);

        assert_eq!(sim.organisms[actor].inv_wood, 4);
        assert_eq!(sim.organisms[actor].tools.get("stone_axe"), Some(&1));
        assert_eq!(sim.organisms[recipient].tools.get("stone_axe"), Some(&1));
        assert_eq!(sim.organisms[actor].org_trust.get(&recipient_id), Some(&0.56));
        assert_eq!(sim.organisms[recipient].org_trust.get(&actor_id), Some(&0.56));
        assert!(sim.organisms[actor].friends.contains_key(&recipient_id));
        assert!(sim.organisms[recipient].friends.contains_key(&actor_id));
        assert!(sim.organisms[recipient]
            .life_log
            .iter()
            .any(|entry| entry.text.contains("received stone_axe")));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_recipient = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == recipient_id)
            .unwrap();
        assert_eq!(loaded_recipient.tools.get("stone_axe"), Some(&1));
        assert!(loaded_recipient.friends.contains_key(&actor_id));
    }

    #[test]
    fn saturated_recipient_does_not_destroy_the_gift() {
        let (mut sim, actor, recipient) = gift_world();
        sim.organisms[actor].tools.insert("stone_axe".into(), 1);
        sim.organisms[recipient].tools.insert("stone_axe".into(), u8::MAX);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 90, 90, &spatial);

        assert_eq!(apply(&mut ctx), 0.0);
        assert_eq!(sim.organisms[actor].tools.get("stone_axe"), Some(&1));
        assert_eq!(sim.organisms[recipient].tools.get("stone_axe"), Some(&u8::MAX));
    }

    #[test]
    fn action_is_offered_and_executable_only_for_a_real_transfer() {
        let (mut sim, actor, recipient) = gift_world();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let actions = crate::sim::actions::available_actions(&sim, actor, 90, 90, &spatial);
        assert!(!actions.contains(&227));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 227, 90, 90, &spatial),
            None
        );

        sim.organisms[actor].tools.insert("stone_axe".into(), 1);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let actions = crate::sim::actions::available_actions(&sim, actor, 90, 90, &spatial);
        assert!(actions.contains(&227));

        sim.organisms[recipient].tools.insert("stone_axe".into(), u8::MAX);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let actions = crate::sim::actions::available_actions(&sim, actor, 90, 90, &spatial);
        assert!(!actions.contains(&227));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 227, 90, 90, &spatial),
            None
        );
        assert_eq!(sim.organisms[actor].tools.get("stone_axe"), Some(&1));
    }
}
