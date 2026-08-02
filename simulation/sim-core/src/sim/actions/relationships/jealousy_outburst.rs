use super::super::ctx::ActionCtx;
use crate::sim::{simulation::Simulation, spatial::SpatialIndex};

const JEALOUSY_THRESHOLD: f32 = 0.60;
const OUTBURST_COOLDOWN: u64 = 300;
const RUPTURE_TRUST: f32 = -0.55;

fn recently_confronted(actor: &crate::organism::organism::Organism, bond_id: &str, tick: u64) -> bool {
    actor.life_log.iter().rev().any(|entry| {
        entry.category == "jealousy_outburst"
            && entry.related_id.as_deref() == Some(bond_id)
            && tick.saturating_sub(entry.tick) < OUTBURST_COOLDOWN
    })
}

fn choose_scene(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> Option<(usize, usize)> {
    let actor = &sim.organisms[actor_idx];
    if actor.jealousy < JEALOUSY_THRESHOLD {
        return None;
    }

    let bond_idx = nearby
        .iter()
        .copied()
        .filter(|&index| {
            let person = &sim.organisms[index];
            index != actor_idx
                && person.alive
                && (actor.partner_id.as_deref() == Some(person.id.as_str())
                    || actor.friends.contains_key(&person.id))
                && !recently_confronted(actor, &person.id, sim.tick_count)
                && (person.x - actor.x).abs() + (person.y - actor.y).abs() <= 6.0
        })
        .max_by(|&left, &right| {
            let left_person = &sim.organisms[left];
            let right_person = &sim.organisms[right];
            let left_partner = actor.partner_id.as_deref() == Some(left_person.id.as_str());
            let right_partner = actor.partner_id.as_deref() == Some(right_person.id.as_str());
            let left_trust = actor.org_trust.get(&left_person.id).copied().unwrap_or(0.0);
            let right_trust = actor.org_trust.get(&right_person.id).copied().unwrap_or(0.0);
            left_partner
                .cmp(&right_partner)
                .then_with(|| left_trust.total_cmp(&right_trust))
                .then_with(|| right_person.id.cmp(&left_person.id))
        })?;

    let bond = &sim.organisms[bond_idx];
    let rival_idx = nearby
        .iter()
        .copied()
        .filter(|&index| {
            let rival = &sim.organisms[index];
            index != actor_idx
                && index != bond_idx
                && rival.alive
                && rival.lineage_id != actor.lineage_id
                && (rival.x - bond.x).abs() + (rival.y - bond.y).abs() <= 4.0
        })
        .min_by(|&left, &right| {
            let left_rival = &sim.organisms[left];
            let right_rival = &sim.organisms[right];
            let left_distance = (left_rival.x - bond.x).abs() + (left_rival.y - bond.y).abs();
            let right_distance = (right_rival.x - bond.x).abs() + (right_rival.y - bond.y).abs();
            left_distance
                .total_cmp(&right_distance)
                .then_with(|| left_rival.id.cmp(&right_rival.id))
        })?;

    Some((bond_idx, rival_idx))
}

pub(crate) fn can_apply_with_nearby(sim: &Simulation, actor_idx: usize, nearby: &[usize]) -> bool {
    choose_scene(sim, actor_idx, nearby).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, actor_idx: usize, spatial: &SpatialIndex) -> bool {
    let actor = &sim.organisms[actor_idx];
    let nearby = spatial.query(actor.x as i32, actor.y as i32, 6);
    can_apply_with_nearby(sim, actor_idx, &nearby)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((bond_idx, rival_idx)) = choose_scene(ctx.sim, ctx.idx, &ctx.near) else {
        ctx.think("jealous feelings pass without a confrontation");
        return 0.0;
    };

    let actor_id = ctx.sim.organisms[ctx.idx].id.clone();
    let actor_name = ctx.sim.organisms[ctx.idx].name.clone();
    let actor_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let bond_id = ctx.sim.organisms[bond_idx].id.clone();
    let bond_name = ctx.sim.organisms[bond_idx].name.clone();
    let rival_id = ctx.sim.organisms[rival_idx].id.clone();
    let rival_name = ctx.sim.organisms[rival_idx].name.clone();
    let rival_lineage = ctx.sim.organisms[rival_idx].lineage_id.clone();
    let was_partner = ctx.sim.organisms[ctx.idx].partner_id.as_deref() == Some(&bond_id);

    {
        let actor = &mut ctx.sim.organisms[ctx.idx];
        let bond_trust = actor.org_trust.entry(bond_id.clone()).or_insert(0.0);
        *bond_trust = (*bond_trust - 0.10).max(-1.0);
        let rival_trust = actor.org_trust.entry(rival_id.clone()).or_insert(0.0);
        *rival_trust = (*rival_trust - 0.08).max(-1.0);
        actor.jealousy = (actor.jealousy - 0.35).max(0.0);
        actor.anger = (actor.anger + 0.18).min(1.0);
        actor.regret = (actor.regret + 0.14).min(1.0);
        actor.comfort = (actor.comfort - 0.08).max(0.0);
        actor.update_attitude(&rival_lineage, -0.05);
        actor.log_life_rel(
            ctx.tick,
            "jealousy_outburst",
            format!("confronted {bond_name} over {rival_name}"),
            Some(bond_id.clone()),
            Some(bond_name.clone()),
        );
    }
    {
        let bond = &mut ctx.sim.organisms[bond_idx];
        let trust = bond.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust - 0.14).max(-1.0);
        bond.anger = (bond.anger + 0.18).min(1.0);
        bond.fear_level = (bond.fear_level + 0.06).min(1.0);
        bond.comfort = (bond.comfort - 0.10).max(0.0);
        bond.think(&format!("hurt by {actor_name}'s jealousy"), ctx.tick);
        bond.log_life_rel(
            ctx.tick,
            "jealousy_outburst",
            format!("{actor_name} confronted me over {rival_name}"),
            Some(actor_id.clone()),
            Some(actor_name.clone()),
        );
    }
    {
        let rival = &mut ctx.sim.organisms[rival_idx];
        let trust = rival.org_trust.entry(actor_id.clone()).or_insert(0.0);
        *trust = (*trust - 0.08).max(-1.0);
        rival.anger = (rival.anger + 0.10).min(1.0);
        rival.update_attitude(&actor_lineage, -0.03);
        rival.think(&format!("drawn into {actor_name}'s jealousy"), ctx.tick);
        rival.log_life_rel(
            ctx.tick,
            "jealousy_outburst",
            format!("was accused by {actor_name} over {bond_name}"),
            Some(actor_id.clone()),
            Some(actor_name.clone()),
        );
    }

    let bond_trust = ctx.sim.organisms[bond_idx]
        .org_trust
        .get(&actor_id)
        .copied()
        .unwrap_or(0.0);
    if bond_trust <= RUPTURE_TRUST {
        if was_partner {
            ctx.sim.organisms[ctx.idx].partner_id = None;
            if ctx.sim.organisms[bond_idx].partner_id.as_deref() == Some(&actor_id) {
                ctx.sim.organisms[bond_idx].partner_id = None;
            }
            ctx.sim.organisms[ctx.idx].log_life_rel(
                ctx.tick,
                "separation",
                format!("my repeated jealousy ended my partnership with {bond_name}"),
                Some(bond_id.clone()),
                Some(bond_name.clone()),
            );
            ctx.sim.organisms[bond_idx].log_life_rel(
                ctx.tick,
                "separation",
                format!("ended my partnership with {actor_name} after repeated jealous confrontations"),
                Some(actor_id.clone()),
                Some(actor_name.clone()),
            );
        }
        ctx.sim.organisms[ctx.idx].estrange_friend(&bond_id, &bond_name, ctx.tick, "repeated jealousy");
        ctx.sim.organisms[bond_idx].estrange_friend(&actor_id, &actor_name, ctx.tick, "repeated jealousy");
    }

    ctx.think(&format!("confronting {bond_name} over {rival_name}"));
    ctx.event(
        "drama",
        &format!("confronted {bond_name} in a jealous outburst over {rival_name}"),
    );
    0.004
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jealousy_world() -> (Simulation, usize, usize, usize, usize) {
        let mut sim = Simulation::new(0x0EA1_2320);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let actor = 0;
        let partner = 1;
        let rival = 2;
        let friend = 3;
        let lineage = sim.organisms[actor].lineage_id.clone();
        for (index, x) in [(actor, 70.0), (partner, 71.0), (rival, 72.0), (friend, 73.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].lineage_id.clone_from(&lineage);
            sim.organisms[index].x = x;
            sim.organisms[index].y = 70.0;
        }
        let actor_id = sim.organisms[actor].id.clone();
        let partner_id = sim.organisms[partner].id.clone();
        let friend_id = sim.organisms[friend].id.clone();
        sim.organisms[actor].partner_id = Some(partner_id);
        sim.organisms[partner].partner_id = Some(actor_id);
        sim.organisms[actor].friends.insert(friend_id, "Friend".into());
        sim.organisms[rival].lineage_id = "foreign-rival".into();
        sim.tick_count = 2_000;
        (sim, actor, partner, rival, friend)
    }

    #[test]
    fn outburst_targets_partner_and_creates_recoverable_relationship_damage() {
        let (mut sim, actor, partner, rival, friend) = jealousy_world();
        let actor_id = sim.organisms[actor].id.clone();
        let partner_id = sim.organisms[partner].id.clone();
        let rival_id = sim.organisms[rival].id.clone();
        sim.organisms[actor].jealousy = 0.85;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, actor, 232, 70, 70, &spatial).is_some());
        assert_eq!(sim.organisms[friend].org_trust.get(&actor_id), None);
        assert_eq!(sim.organisms[actor].org_trust[&partner_id], -0.10);
        assert_eq!(sim.organisms[partner].org_trust[&actor_id], -0.14);
        assert_eq!(sim.organisms[rival].org_trust[&actor_id], -0.08);
        assert!(sim.organisms[actor].jealousy < 0.85);
        assert!(sim.organisms[actor].regret > 0.0);

        // The damage feeds the existing apology and direct reconciliation
        // systems instead of becoming an isolated mood penalty.
        let actions = crate::sim::actions::available_actions(&sim, actor, 70, 70, &spatial);
        assert!(actions.contains(&86));
        assert!(actions.contains(&234));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_partner = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == partner_id)
            .unwrap();
        assert_eq!(loaded_partner.org_trust[&actor_id], -0.14);
        assert!(loaded_partner.life_log.iter().any(|entry| {
            entry.category == "jealousy_outburst" && entry.related_id.as_deref() == Some(&actor_id)
        }));
        assert_eq!(
            loaded
                .organisms
                .iter()
                .find(|organism| organism.id == rival_id)
                .unwrap()
                .lineage_id,
            "foreign-rival"
        );
    }

    #[test]
    fn action_requires_real_jealousy_bond_and_rival_and_obeys_cooldown() {
        let (mut sim, actor, partner, rival, friend) = jealousy_world();
        sim.organisms[friend].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 70, 70, &spatial).contains(&232));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, actor, 232, 70, 70, &spatial),
            None
        );

        sim.organisms[actor].jealousy = 0.80;
        sim.organisms[rival].alive = false;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, actor, 70, 70, &spatial).contains(&232));

        sim.organisms[rival].alive = true;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(crate::sim::actions::try_apply(&mut sim, actor, 232, 70, 70, &spatial).is_some());
        sim.organisms[actor].jealousy = 0.80;
        assert!(!crate::sim::actions::available_actions(&sim, actor, 70, 70, &spatial).contains(&232));

        sim.tick_count += OUTBURST_COOLDOWN;
        assert!(crate::sim::actions::available_actions(&sim, actor, 70, 70, &spatial).contains(&232));
        assert_eq!(
            sim.organisms[partner].partner_id.as_deref(),
            Some(sim.organisms[actor].id.as_str())
        );
    }

    #[test]
    fn severe_repeated_damage_can_end_a_partnership_and_friendship() {
        let (mut sim, actor, partner, _rival, _friend) = jealousy_world();
        let actor_id = sim.organisms[actor].id.clone();
        let actor_name = sim.organisms[actor].name.clone();
        let partner_id = sim.organisms[partner].id.clone();
        let partner_name = sim.organisms[partner].name.clone();
        sim.organisms[actor]
            .friends
            .insert(partner_id.clone(), "Partner".into());
        sim.organisms[partner]
            .friends
            .insert(actor_id.clone(), "Actor".into());
        sim.organisms[partner].org_trust.insert(actor_id.clone(), -0.50);
        sim.organisms[actor].jealousy = 0.90;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, actor, 70, 70, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert_eq!(sim.organisms[actor].partner_id, None);
        assert_eq!(sim.organisms[partner].partner_id, None);
        assert!(!sim.organisms[actor].friends.contains_key(&partner_id));
        assert!(!sim.organisms[partner].friends.contains_key(&actor_id));
        assert_eq!(
            sim.organisms[actor]
                .former_friends
                .get(&partner_id)
                .map(String::as_str),
            Some(partner_name.as_str())
        );
        assert_eq!(
            sim.organisms[partner]
                .former_friends
                .get(&actor_id)
                .map(String::as_str),
            Some(actor_name.as_str())
        );
        assert!(sim.organisms[partner]
            .life_log
            .iter()
            .any(|entry| entry.category == "separation"));

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_actor = loaded
            .organisms
            .iter()
            .find(|person| person.id == actor_id)
            .unwrap();
        let loaded_partner = loaded
            .organisms
            .iter()
            .find(|person| person.id == partner_id)
            .unwrap();
        assert_eq!(
            loaded_actor.former_friends.get(&partner_id).map(String::as_str),
            Some(partner_name.as_str())
        );
        assert_eq!(
            loaded_partner.former_friends.get(&actor_id).map(String::as_str),
            Some(actor_name.as_str())
        );
    }
}
