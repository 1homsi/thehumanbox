use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let actor_x = ctx.sim.organisms[ctx.idx].x;
    let actor_y = ctx.sim.organisms[ctx.idx].y;
    let actor_trust = &ctx.sim.organisms[ctx.idx].org_trust;
    let Some(ki) = ctx.near.iter().copied().max_by(|&left, &right| {
        let left_org = &ctx.sim.organisms[left];
        let right_org = &ctx.sim.organisms[right];
        let left_trust = actor_trust.get(&left_org.id).copied().unwrap_or(0.0);
        let right_trust = actor_trust.get(&right_org.id).copied().unwrap_or(0.0);
        let left_distance = (left_org.x - actor_x).abs() + (left_org.y - actor_y).abs();
        let right_distance = (right_org.x - actor_x).abs() + (right_org.y - actor_y).abs();
        left_trust
            .total_cmp(&right_trust)
            .then_with(|| {
                (left_org.lineage_id == actor_lineage).cmp(&(right_org.lineage_id == actor_lineage))
            })
            // `max_by` should prefer the nearer person when trust is tied.
            .then_with(|| right_distance.total_cmp(&left_distance))
            .then_with(|| right_org.id.cmp(&left_org.id))
    }) else {
        ctx.think("secrets with no one to tell");
        return 0.0;
    };
    let confidant_id = ctx.sim.organisms[ki].id.clone();
    let confidant_name = ctx.sim.organisms[ki].name.clone();
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(confidant_id.clone()).or_insert(0.0);
        *t = (*t + 0.08).min(1.0);
        me.comfort = (me.comfort + 0.04).min(1.0);
        me.loneliness = (me.loneliness - 0.04).max(0.0);
    }
    {
        let confidant = &mut ctx.sim.organisms[ki];
        let trust = confidant.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.06).min(1.0);
        confidant.comfort = (confidant.comfort + 0.03).min(1.0);
        confidant.loneliness = (confidant.loneliness - 0.03).max(0.0);
        confidant.think(&format!("keeping {actor_name}'s secret"), ctx.tick);
    }

    const FRIEND_THRESHOLD: f32 = 0.55;
    let actor_trust = ctx.sim.organisms[ctx.idx]
        .org_trust
        .get(&confidant_id)
        .copied()
        .unwrap_or(0.0);
    let confidant_trust = ctx.sim.organisms[ki]
        .org_trust
        .get(&actor_id)
        .copied()
        .unwrap_or(0.0);
    if actor_trust >= FRIEND_THRESHOLD {
        ctx.sim.organisms[ctx.idx].add_friend(&confidant_id, &confidant_name, ctx.tick);
    }
    if confidant_trust >= FRIEND_THRESHOLD {
        ctx.sim.organisms[ki].add_friend(&actor_id, &actor_name, ctx.tick);
    }

    ctx.think(&format!("sharing a secret with {confidant_name}"));
    ctx.event("bond", &format!("whispered a secret to {confidant_name}"));
    0.006 + actor_trust.max(0.0) * 0.004
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

    fn two_people() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0x5EC2_E700);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let confidant = 1;
        sim.organisms[actor].alive = true;
        sim.organisms[confidant].alive = true;
        sim.organisms[actor].x = 80.0;
        sim.organisms[actor].y = 80.0;
        sim.organisms[confidant].x = 81.0;
        sim.organisms[confidant].y = 80.0;
        sim.tick_count = 400;
        (sim, actor, confidant)
    }

    #[test]
    fn sharing_a_secret_builds_reciprocal_trust_and_recognized_friendship() {
        let (mut sim, actor, confidant) = two_people();
        let actor_id = sim.organisms[actor].id.clone();
        let actor_name = sim.organisms[actor].name.clone();
        let confidant_id = sim.organisms[confidant].id.clone();
        let confidant_name = sim.organisms[confidant].name.clone();
        sim.organisms[actor].org_trust.insert(confidant_id.clone(), 0.50);
        sim.organisms[confidant].org_trust.insert(actor_id.clone(), 0.50);
        sim.organisms[actor].loneliness = 0.50;
        sim.organisms[confidant].loneliness = 0.50;

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 80, 80, &spatial);
        let reward = apply(&mut ctx);

        assert!(reward > 0.006);
        assert_eq!(sim.organisms[actor].org_trust[&confidant_id], 0.58);
        assert_eq!(sim.organisms[confidant].org_trust[&actor_id], 0.56);
        assert_eq!(sim.organisms[actor].friends[&confidant_id], confidant_name);
        assert_eq!(sim.organisms[confidant].friends[&actor_id], actor_name);
        assert!(sim.organisms[actor].loneliness < 0.50);
        assert!(sim.organisms[confidant].loneliness < 0.50);
        assert!(sim
            .events
            .back()
            .is_some_and(|event| event.detail.contains("whispered a secret to")));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == actor_id)
            .unwrap();
        let loaded_confidant = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == confidant_id)
            .unwrap();
        assert_eq!(loaded_actor.friends.get(&confidant_id), Some(&confidant_name));
        assert_eq!(loaded_confidant.friends.get(&actor_id), Some(&actor_name));
        assert_eq!(loaded_actor.org_trust.get(&confidant_id), Some(&0.58));
        assert_eq!(loaded_confidant.org_trust.get(&actor_id), Some(&0.56));
    }

    #[test]
    fn sharing_a_secret_has_no_effect_without_an_actual_listener() {
        let (mut sim, actor, confidant) = two_people();
        sim.organisms[confidant].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 80, 80, &spatial);

        assert_eq!(apply(&mut ctx), 0.0);
        assert!(sim.organisms[actor].org_trust.is_empty());
        assert_eq!(sim.organisms[actor].thought, "secrets with no one to tell");
    }

    #[test]
    fn later_era_share_secret_uses_the_same_persistent_bond_mechanic() {
        let (mut sim, actor, confidant) = two_people();
        let actor_id = sim.organisms[actor].id.clone();
        let confidant_id = sim.organisms[confidant].id.clone();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 80, 80, &spatial);

        let reward = crate::sim::actions::social_play::apply(1291, &mut ctx);

        assert!(reward > 0.0);
        assert_eq!(sim.organisms[actor].org_trust[&confidant_id], 0.08);
        assert_eq!(sim.organisms[confidant].org_trust[&actor_id], 0.06);
    }

    #[test]
    fn confidant_selection_prefers_established_trust_over_spatial_bucket_order() {
        let (mut sim, actor, nearby) = two_people();
        let trusted = 2;
        sim.organisms[trusted].alive = true;
        sim.organisms[trusted].x = 82.0;
        sim.organisms[trusted].y = 80.0;
        let nearby_id = sim.organisms[nearby].id.clone();
        let trusted_id = sim.organisms[trusted].id.clone();
        sim.organisms[actor].org_trust.insert(nearby_id.clone(), 0.10);
        sim.organisms[actor].org_trust.insert(trusted_id.clone(), 0.40);

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 80, 80, &spatial);
        apply(&mut ctx);

        assert!((sim.organisms[actor].org_trust[&trusted_id] - 0.48).abs() < f32::EPSILON);
        assert_eq!(sim.organisms[actor].org_trust[&nearby_id], 0.10);
        assert!(sim.organisms[trusted]
            .org_trust
            .contains_key(&sim.organisms[actor].id));
        assert!(sim.organisms[nearby].org_trust.is_empty());
    }
}
