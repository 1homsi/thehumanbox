use super::super::ctx::ActionCtx;
use crate::{
    organism::{decision_bias::protection_target_id, organism::Organism},
    sim::{age_stage::AgeStage, simulation::Simulation, spatial::SpatialIndex},
};

const PROTECTION_DURATION: u64 = 360;

fn protector_is_available(protector: &Organism, tick: u64) -> bool {
    protector.age_stage().can_combat()
        && protector.health >= 0.60
        && protector.energy >= 0.40
        && (protector.directive.is_empty() || tick >= protector.directive_until)
}

fn is_close_relationship(sim: &Simulation, protector_idx: usize, ward_idx: usize) -> bool {
    let protector = &sim.organisms[protector_idx];
    let ward = &sim.organisms[ward_idx];
    ward.lineage_id == protector.lineage_id
        || protector.friends.contains_key(&ward.id)
        || protector.org_trust.get(&ward.id).copied().unwrap_or(0.0) >= 0.50
}

fn ward_is_vulnerable(ward: &Organism) -> bool {
    ward.health < 0.68
        || ward.fear_level > 0.45
        || ward.pregnant
        || matches!(ward.age_stage(), AgeStage::Infant | AgeStage::Child)
}

pub(crate) fn active_protector_index(
    organisms: &[Organism],
    ward_idx: usize,
    tick: u64,
    max_distance: f32,
) -> Option<usize> {
    let ward = &organisms[ward_idx];
    organisms
        .iter()
        .enumerate()
        .filter(|(index, protector)| {
            *index != ward_idx
                && protector.alive
                && protector.health > 0.0
                && tick < protector.directive_until
                && protection_target_id(&protector.directive) == Some(ward.id.as_str())
                && (protector.x - ward.x).abs() + (protector.y - ward.y).abs() <= max_distance
        })
        .max_by(|(_, left), (_, right)| {
            let left_strength = left.health * left.energy * left.combat_tool_bonus();
            let right_strength = right.health * right.energy * right.combat_tool_bonus();
            left_strength
                .total_cmp(&right_strength)
                .then_with(|| right.id.cmp(&left.id))
        })
        .map(|(index, _)| index)
}

fn has_active_protector_nearby(
    organisms: &[Organism],
    ward_idx: usize,
    tick: u64,
    candidate_indices: &[usize],
) -> bool {
    let ward = &organisms[ward_idx];
    candidate_indices.iter().copied().any(|index| {
        let protector = &organisms[index];
        index != ward_idx
            && protector.alive
            && protector.health > 0.0
            && tick < protector.directive_until
            && protection_target_id(&protector.directive) == Some(ward.id.as_str())
            && (protector.x - ward.x).abs() + (protector.y - ward.y).abs() <= 6.0
    })
}

pub(crate) fn intercept_danger_damage(
    organisms: &mut [Organism],
    ward_idx: usize,
    damage: f32,
    tick: u64,
    cause: &str,
) -> Option<usize> {
    let protector_idx = active_protector_index(organisms, ward_idx, tick, 3.0);
    let Some(protector_idx) = protector_idx else {
        let ward = &mut organisms[ward_idx];
        ward.health = (ward.health - damage).max(0.0);
        ward.fear_level = (ward.fear_level + 0.25).min(1.0);
        return None;
    };

    let ward_id = organisms[ward_idx].id.clone();
    let ward_name = organisms[ward_idx].name.clone();
    let protector_id = organisms[protector_idx].id.clone();
    let protector_name = organisms[protector_idx].name.clone();
    {
        let ward = &mut organisms[ward_idx];
        ward.health = (ward.health - damage * 0.35).max(0.0);
        ward.fear_level = (ward.fear_level + 0.10).min(1.0);
        ward.think(&format!("{protector_name} shields me from {cause}"), tick);
        ward.log_life_rel(
            tick,
            "protection",
            format!("{protector_name} shielded me from {cause}"),
            Some(protector_id.clone()),
            Some(protector_name.clone()),
        );
    }
    {
        let protector = &mut organisms[protector_idx];
        protector.health = (protector.health - damage * 0.55).max(0.0);
        protector.fear_level = (protector.fear_level + 0.14).min(1.0);
        protector.think(&format!("shielding {ward_name} from {cause}"), tick);
        protector.log_life_rel(
            tick,
            "protection",
            format!("shielded {ward_name} from {cause}"),
            Some(ward_id),
            Some(ward_name),
        );
    }
    Some(protector_idx)
}

fn choose_ward(
    sim: &Simulation,
    protector_idx: usize,
    nearby: &[usize],
    spatial: &SpatialIndex,
) -> Option<usize> {
    let protector = &sim.organisms[protector_idx];
    if !protector_is_available(protector, sim.tick_count) {
        return None;
    }
    nearby
        .iter()
        .copied()
        .filter(|&index| {
            let ward = &sim.organisms[index];
            index != protector_idx
                && ward.alive
                && ward_is_vulnerable(ward)
                && is_close_relationship(sim, protector_idx, index)
                && !has_active_protector_nearby(
                    &sim.organisms,
                    index,
                    sim.tick_count,
                    &spatial.query(ward.x as i32, ward.y as i32, 6),
                )
                && (ward.x - protector.x).abs() + (ward.y - protector.y).abs() <= 6.0
        })
        .min_by(|&left, &right| {
            let left_org = &sim.organisms[left];
            let right_org = &sim.organisms[right];
            let left_child = matches!(left_org.age_stage(), AgeStage::Infant | AgeStage::Child);
            let right_child = matches!(right_org.age_stage(), AgeStage::Infant | AgeStage::Child);
            let left_risk = left_org.health - left_org.fear_level * 0.35;
            let right_risk = right_org.health - right_org.fear_level * 0.35;
            right_child
                .cmp(&left_child)
                .then_with(|| left_risk.total_cmp(&right_risk))
                .then_with(|| left_org.id.cmp(&right_org.id))
        })
}

pub(crate) fn can_apply_with_nearby(
    sim: &Simulation,
    protector_idx: usize,
    nearby: &[usize],
    spatial: &SpatialIndex,
) -> bool {
    choose_ward(sim, protector_idx, nearby, spatial).is_some()
}

pub(crate) fn can_apply(sim: &Simulation, protector_idx: usize, spatial: &SpatialIndex) -> bool {
    let protector = &sim.organisms[protector_idx];
    let nearby = spatial.query(protector.x as i32, protector.y as i32, 6);
    can_apply_with_nearby(sim, protector_idx, &nearby, spatial)
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(ward_idx) = choose_ward(ctx.sim, ctx.idx, &ctx.near, ctx.spatial) else {
        ctx.think("no vulnerable loved one needs a guard");
        return 0.0;
    };

    let protector_id = ctx.sim.organisms[ctx.idx].id.clone();
    let protector_name = ctx.sim.organisms[ctx.idx].name.clone();
    let protector_lineage = ctx.sim.organisms[ctx.idx].lineage_id.clone();
    let ward_id = ctx.sim.organisms[ward_idx].id.clone();
    let ward_name = ctx.sim.organisms[ward_idx].name.clone();
    let ward_lineage = ctx.sim.organisms[ward_idx].lineage_id.clone();
    let ward_health = ctx.sim.organisms[ward_idx].health;
    let expires = ctx.tick.saturating_add(PROTECTION_DURATION);

    {
        let protector = &mut ctx.sim.organisms[ctx.idx];
        protector.directive = format!("protect:{ward_id}");
        protector.directive_until = expires;
        let trust = protector.org_trust.entry(ward_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.04).min(1.0);
        protector.hope = (protector.hope + 0.03).min(1.0);
        if protector_lineage != ward_lineage {
            protector.update_attitude(&ward_lineage, 0.015);
        }
        protector.log_life_rel(
            ctx.tick,
            "protection",
            format!("promised to guard {ward_name}"),
            Some(ward_id.clone()),
            Some(ward_name.clone()),
        );
    }
    {
        let ward = &mut ctx.sim.organisms[ward_idx];
        let trust = ward.org_trust.entry(protector_id.clone()).or_insert(0.0);
        *trust = (*trust + 0.12).min(1.0);
        ward.fear_level = (ward.fear_level - 0.10).max(0.0);
        ward.comfort = (ward.comfort + 0.07).min(1.0);
        if protector_lineage != ward_lineage {
            ward.update_attitude(&protector_lineage, 0.025);
        }
        ward.think(&format!("{protector_name} is guarding me"), ctx.tick);
        ward.log_life_rel(
            ctx.tick,
            "protection",
            format!("{protector_name} promised to keep me safe"),
            Some(protector_id.clone()),
            Some(protector_name.clone()),
        );
    }

    debug_assert_eq!(ctx.sim.organisms[ward_idx].health, ward_health);
    ctx.think(&format!("guarding {ward_name}"));
    ctx.event("defense", &format!("promised to protect {ward_name}"));
    0.014
}

#[cfg(test)]
mod tests {
    use super::*;

    fn protection_world() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0x06A4_D1A0);
        for organism in &mut sim.organisms {
            organism.alive = false;
        }
        let protector = 0;
        let ward = 1;
        for (index, x) in [(protector, 70.0), (ward, 71.0)] {
            sim.organisms[index].alive = true;
            sim.organisms[index].x = x;
            sim.organisms[index].y = 70.0;
        }
        sim.organisms[protector].age = sim.organisms[protector].max_age / 2;
        sim.organisms[protector].health = 0.90;
        sim.organisms[protector].energy = 0.80;
        sim.organisms[ward].age = sim.organisms[ward].max_age / 2;
        sim.organisms[ward].health = 0.55;
        sim.organisms[ward].fear_level = 0.60;
        sim.tick_count = 4_000;
        (sim, protector, ward)
    }

    #[test]
    fn protection_creates_a_persistent_guard_duty_without_healing() {
        let (mut sim, protector, ward) = protection_world();
        let ward_id = sim.organisms[ward].id.clone();
        let protector_id = sim.organisms[protector].id.clone();
        let health_before = sim.organisms[ward].health;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(crate::sim::actions::try_apply(&mut sim, protector, 239, 70, 70, &spatial).is_some());
        assert_eq!(sim.organisms[ward].health, health_before);
        assert_eq!(sim.organisms[protector].directive, format!("protect:{ward_id}"));
        assert_eq!(
            sim.organisms[protector].directive_until,
            4_000 + PROTECTION_DURATION
        );
        assert_eq!(sim.organisms[ward].org_trust[&protector_id], 0.12);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        let loaded_protector = loaded
            .organisms
            .iter()
            .find(|organism| organism.id == protector_id)
            .unwrap();
        assert_eq!(loaded_protector.directive, format!("protect:{ward_id}"));
        assert_eq!(loaded_protector.directive_until, 4_000 + PROTECTION_DURATION);
    }

    #[test]
    fn a_nearby_guard_intercepts_most_danger_damage() {
        let (mut guarded, protector, ward) = protection_world();
        let ward_id = guarded.organisms[ward].id.clone();
        guarded.organisms[protector].directive = format!("protect:{ward_id}");
        guarded.organisms[protector].directive_until = guarded.tick_count + 100;
        let ward_health = guarded.organisms[ward].health;
        let protector_health = guarded.organisms[protector].health;
        let guarded_tick = guarded.tick_count;

        assert_eq!(
            intercept_danger_damage(&mut guarded.organisms, ward, 0.20, guarded_tick, "a wolf"),
            Some(protector)
        );
        assert!((guarded.organisms[ward].health - (ward_health - 0.07)).abs() < f32::EPSILON);
        assert!((guarded.organisms[protector].health - (protector_health - 0.11)).abs() < f32::EPSILON);
        assert!(guarded.organisms[ward]
            .life_log
            .iter()
            .any(|entry| entry.category == "protection" && entry.text.contains("wolf")));

        let (mut unguarded, _, unguarded_ward) = protection_world();
        let unguarded_health = unguarded.organisms[unguarded_ward].health;
        let unguarded_tick = unguarded.tick_count;
        assert_eq!(
            intercept_danger_damage(
                &mut unguarded.organisms,
                unguarded_ward,
                0.20,
                unguarded_tick,
                "a wolf"
            ),
            None
        );
        assert!(
            (unguarded.organisms[unguarded_ward].health - (unguarded_health - 0.20)).abs() < f32::EPSILON
        );
    }

    #[test]
    fn action_is_hidden_when_no_guard_duty_can_start() {
        let (mut sim, protector, ward) = protection_world();
        sim.organisms[ward].health = 1.0;
        sim.organisms[ward].fear_level = 0.0;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, protector, 70, 70, &spatial).contains(&239));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, protector, 239, 70, 70, &spatial),
            None
        );

        sim.organisms[ward].health = 0.40;
        sim.organisms[protector].health = 0.40;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!crate::sim::actions::available_actions(&sim, protector, 70, 70, &spatial).contains(&239));
    }

    #[test]
    fn active_guard_duty_cannot_be_reassigned_before_it_expires() {
        let (mut sim, protector, ward) = protection_world();
        let ward_id = sim.organisms[ward].id.clone();
        sim.organisms[protector].directive = format!("protect:{ward_id}");
        sim.organisms[protector].directive_until = sim.tick_count + 100;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!crate::sim::actions::available_actions(&sim, protector, 70, 70, &spatial).contains(&239));
        assert_eq!(
            crate::sim::actions::try_apply(&mut sim, protector, 239, 70, 70, &spatial),
            None
        );
    }

    #[test]
    fn trusted_cross_lineage_person_can_receive_protection() {
        let (mut sim, protector, ward) = protection_world();
        let protector_lineage = sim.organisms[protector].lineage_id.clone();
        let ward_lineage = "protected-neighbor".to_string();
        let ward_id = sim.organisms[ward].id.clone();
        sim.organisms[ward].lineage_id.clone_from(&ward_lineage);
        sim.organisms[protector].org_trust.insert(ward_id, 0.60);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, protector, 70, 70, &spatial);

        assert!(apply(&mut ctx) > 0.0);
        assert!(sim.organisms[protector].attitude_toward(&ward_lineage) > 0.0);
        assert!(sim.organisms[ward].attitude_toward(&protector_lineage) > 0.0);
    }
}
