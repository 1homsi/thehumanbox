use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

fn is_close_relationship(sim: &Simulation, actor_idx: usize, other_idx: usize) -> bool {
    let actor = &sim.organisms[actor_idx];
    let other = &sim.organisms[other_idx];
    other.lineage_id == actor.lineage_id
        || actor.friends.contains_key(&other.id)
        || actor.org_trust.get(&other.id).copied().unwrap_or(0.0) >= 0.55
}

fn choose_grieving_person(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<usize> {
    let actor = &sim.organisms[actor_idx];
    nearby
        .iter()
        .copied()
        .filter(|&index| {
            let other = &sim.organisms[index];
            index != actor_idx
                && other.alive
                && other.grief_ticks > 0
                && is_close_relationship(sim, actor_idx, index)
                && (other.x - actor.x).abs() + (other.y - actor.y).abs() <= 6.0
        })
        .max_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_trust = actor.org_trust.get(&left_org.id).copied().unwrap_or(0.0);
            let right_trust = actor.org_trust.get(&right_org.id).copied().unwrap_or(0.0);
            let left_distance = (left_org.x - actor.x).abs() + (left_org.y - actor.y).abs();
            let right_distance = (right_org.x - actor.x).abs() + (right_org.y - actor.y).abs();
            left_org
                .grief_ticks
                .cmp(&right_org.grief_ticks)
                .then_with(|| left_trust.total_cmp(&right_trust))
                .then_with(|| right_distance.total_cmp(&left_distance))
                .then_with(|| right_org.id.cmp(&left_org.id))
        })
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_grieving_person(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(grieving_idx) = choose_grieving_person(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("no grieving loved one nearby");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let grieving_id = ctx.sim.organisms[grieving_idx].id.clone();
    let grieving_name = ctx.sim.organisms[grieving_idx].name.clone();
    let trusted = ctx.sim.organisms[ctx.idx].friends.contains_key(&grieving_id)
        || ctx.sim.organisms[ctx.idx]
            .org_trust
            .get(&grieving_id)
            .copied()
            .unwrap_or(0.0)
            >= 0.55;
    let relief = if trusted { 120 } else { 75 };
    let grief_before = ctx.sim.organisms[grieving_idx].grief_ticks;
    let relieved = grief_before.min(relief);

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let trust = actor.org_trust.entry(grieving_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.05).min(1.0);
        actor.comfort = (actor.comfort + 0.04).min(1.0);
        actor.gratitude = (actor.gratitude + 0.02).min(1.0);
    }
    {
        let grieving = &mut ctx.sim.organisms[grieving_idx];
        grieving.grief_ticks = grieving.grief_ticks.saturating_sub(relieved);
        grieving.comfort = (grieving.comfort + 0.10).min(1.0);
        grieving.loneliness = (grieving.loneliness - 0.10).max(0.0);
        grieving.fear_level = (grieving.fear_level - 0.04).max(0.0);
        let trust = grieving.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.10).min(1.0);
        grieving.think(&format!("comforted by {actor_name}"), ctx.tick);
        grieving.log_life_rel(
            ctx.tick,
            "support",
            format!("{actor_name} stayed close through grief"),
            Some(actor_id.clone()),
            Some(actor_name.clone()),
        );
    }

    const FRIEND_THRESHOLD: f32 = 0.55;
    if ctx.sim.organisms[ctx.idx]
        .org_trust
        .get(&grieving_id)
        .copied()
        .unwrap_or(0.0)
        >= FRIEND_THRESHOLD
    {
        ctx.sim.organisms[ctx.idx].add_friend(&grieving_id, &grieving_name, ctx.tick);
    }
    if ctx.sim.organisms[grieving_idx]
        .org_trust
        .get(&actor_id)
        .copied()
        .unwrap_or(0.0)
        >= FRIEND_THRESHOLD
    {
        ctx.sim.organisms[grieving_idx].add_friend(&actor_id, &actor_name, ctx.tick);
    }

    ctx.sim.organisms[ctx.idx].log_life_rel(
        ctx.tick,
        "support",
        format!("comforted {grieving_name} through grief"),
        Some(grieving_id),
        Some(grieving_name.clone()),
    );
    ctx.think(&format!("comforting grieving {grieving_name}"));
    ctx.event(
        "bond",
        &format!("comforted grieving {grieving_name}, easing {relieved} ticks of grief"),
    );
    0.008 + relieved as f32 / 20_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grief_world() -> (Simulation, usize, usize, usize) {
        let mut sim = Simulation::new(0x621E_F001);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let unhurt = 1;
        let grieving = 2;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 110.0), (unhurt, 111.0), (grieving, 112.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 110.0;
        }
        sim.organisms[unhurt].health = 0.20;
        sim.organisms[unhurt].comfort = 0.10;
        sim.organisms[unhurt].grief_ticks = 0;
        sim.organisms[grieving].health = 1.0;
        sim.organisms[grieving].grief_ticks = 300;
        sim.organisms[grieving].loneliness = 0.50;
        sim.tick_count = 800;
        (sim, actor, unhurt, grieving)
    }

    #[test]
    fn comfort_targets_actual_grief_and_reduces_it_persistently() {
        let (mut sim, actor, unhurt, grieving) = grief_world();
        let actor_id = sim.organisms[actor].id.clone();
        let grieving_id = sim.organisms[grieving].id.clone();
        let grieving_health = sim.organisms[grieving].health;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 110, 110, &spatial);

        assert!(apply(&mut ctx) > 0.0);

        assert_eq!(sim.organisms[grieving].grief_ticks, 225);
        assert_eq!(sim.organisms[unhurt].grief_ticks, 0);
        assert_eq!(sim.organisms[grieving].health, grieving_health);
        assert!(sim.organisms[grieving].loneliness < 0.50);
        assert_eq!(sim.organisms[grieving].org_trust.get(&actor_id), Some(&0.10));
        assert!(sim.organisms[grieving]
            .life_log
            .iter()
            .any(|entry| entry.text.contains("stayed close through grief")));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_grieving = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == grieving_id)
            .unwrap();
        assert_eq!(loaded_grieving.grief_ticks, 225);
        assert_eq!(loaded_grieving.org_trust.get(&actor_id), Some(&0.10));
    }

    #[test]
    fn trusted_foreign_friend_can_provide_stronger_grief_support() {
        let (mut sim, actor, unhurt, grieving) = grief_world();
        sim.organisms[unhurt].alive = false;
        let grieving_id = sim.organisms[grieving].id.clone();
        sim.organisms[grieving].lineage_id = "foreign-friend".into();
        sim.organisms[actor].friends.insert(grieving_id, "Friend".into());
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 110, 110, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert_eq!(sim.organisms[grieving].grief_ticks, 180);
    }

    #[test]
    fn action_is_hidden_and_rejected_when_nobody_is_grieving() {
        let (mut sim, actor, _unhurt, grieving) = grief_world();
        sim.organisms[grieving].grief_ticks = 0;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, actor, 110, 110, &spatial).contains(&231));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 231, 110, 110, &spatial),
            None
        );
        assert!(sim.organisms[actor].life_log.is_empty());
    }
}
