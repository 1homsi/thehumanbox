use super::super::ctx::ActionCtx;
use crate::organism::decision_bias::area_guard_target;
use crate::sim::simulation::Simulation;

const GUARD_DUTY_TICKS: u64 = 900;

fn owned_asset_target(sim: &Simulation, idx: usize, x: i32, y: i32) -> Option<(i32, i32)> {
    let actor = sim.organisms.get(idx).filter(|actor| {
        actor.alive && actor.age_stage().can_combat() && actor.energy > 0.25 && actor.health > 0.30
    })?;
    let lineage = actor.lineage_id.as_str();
    let mut targets = Vec::new();
    targets.extend(
        sim.supply_caches
            .iter()
            .filter(|cache| cache.lineage_id == lineage)
            .map(|cache| (cache.x, cache.y)),
    );
    targets.extend(
        sim.farms
            .iter()
            .filter(|farm| farm.owner_lineage == lineage)
            .map(|farm| (farm.x, farm.y)),
    );
    targets.extend(
        sim.buildings
            .iter()
            .filter(|building| {
                building.owner_lineage.as_deref() == Some(lineage)
                    && building.is_complete()
                    && !building.decorative
                    && !building.is_ruined()
            })
            .map(|building| building.closest_footprint_tile(x, y)),
    );
    targets
        .into_iter()
        .filter(|target| (target.0 - x).abs() + (target.1 - y).abs() <= 3)
        .min_by_key(|target| ((target.0 - x).abs() + (target.1 - y).abs(), target.1, target.0))
}

pub fn can_apply(sim: &Simulation, idx: usize, x: i32, y: i32) -> bool {
    owned_asset_target(sim, idx, x, y).is_some()
}

pub fn active_guard(sim: &Simulation, lineage: &str, x: i32, y: i32) -> Option<usize> {
    sim.organisms.iter().enumerate().find_map(|(index, organism)| {
        if !organism.alive
            || organism.lineage_id != lineage
            || organism.health <= 0.25
            || organism.energy <= 0.15
            || sim.tick_count >= organism.directive_until
        {
            return None;
        }
        let target = area_guard_target(&organism.directive)?;
        let assignment_covers = (target.0 - x).abs() + (target.1 - y).abs() <= 4;
        let guard_is_present = (organism.x as i32 - x).abs() + (organism.y as i32 - y).abs() <= 6;
        (assignment_covers && guard_is_present).then_some(index)
    })
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(target) = owned_asset_target(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    ctx.org_mut().directive = format!("guard_area:{}:{}", target.0, target.1);
    ctx.org_mut().directive_until = ctx.tick + GUARD_DUTY_TICKS;
    ctx.org_mut().energy = (ctx.org().energy - 0.015).max(0.0);
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.fear_level = (o.fear_level - 0.04).max(0.0);
    }
    ctx.think("guarding our stores and homes");
    ctx.event("war", "took up a persistent infrastructure guard post");
    0.008
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::actions::try_apply;
    use crate::sim::spatial::SpatialIndex;
    use crate::sim::survival_resources::SupplyCache;

    #[test]
    fn guard_action_assigns_saved_expiring_duty_to_a_real_owned_asset() {
        let mut sim = Simulation::new(0x6A4D);
        let guard = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let lineage = sim.organisms[guard].lineage_id.clone();
        let (x, y) = (sim.organisms[guard].x as i32, sim.organisms[guard].y as i32);
        sim.organisms[guard].age = sim.organisms[guard].max_age / 2;
        sim.organisms[guard].energy = 0.80;
        sim.organisms[guard].health = 0.80;
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: lineage.clone(),
            food: 2,
            ..SupplyCache::default()
        });
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(try_apply(&mut sim, guard, 101, x, y, &spatial).is_some());
        assert_eq!(
            area_guard_target(&sim.organisms[guard].directive),
            Some((x + 1, y))
        );
        assert_eq!(
            sim.organisms[guard].directive_until,
            sim.tick_count + GUARD_DUTY_TICKS
        );
        assert_eq!(active_guard(&sim, &lineage, x + 1, y), Some(guard));

        let json = serde_json::to_string(&sim.to_save_state()).unwrap();
        let state: crate::sim::persistence::SaveState = serde_json::from_str(&json).unwrap();
        let mut loaded = Simulation::from_save(0x6A4D, state);
        let loaded_guard = loaded
            .organisms
            .iter()
            .position(|organism| organism.id == sim.organisms[guard].id)
            .unwrap();
        assert_eq!(active_guard(&loaded, &lineage, x + 1, y), Some(loaded_guard));
        loaded.tick_count = loaded.organisms[loaded_guard].directive_until;
        assert_eq!(active_guard(&loaded, &lineage, x + 1, y), None);
    }

    #[test]
    fn exhausted_person_cannot_start_or_sustain_infrastructure_guard() {
        let mut sim = Simulation::new(0x6A4D71E);
        let guard = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let lineage = sim.organisms[guard].lineage_id.clone();
        let (x, y) = (sim.organisms[guard].x as i32, sim.organisms[guard].y as i32);
        sim.organisms[guard].age = sim.organisms[guard].max_age / 2;
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: lineage.clone(),
            food: 2,
            ..SupplyCache::default()
        });
        sim.organisms[guard].energy = 0.20;
        assert!(!can_apply(&sim, guard, x, y));

        sim.organisms[guard].directive = format!("guard_area:{}:{}", x + 1, y);
        sim.organisms[guard].directive_until = sim.tick_count + 100;
        sim.organisms[guard].energy = 0.10;
        assert_eq!(active_guard(&sim, &lineage, x + 1, y), None);
    }
}
