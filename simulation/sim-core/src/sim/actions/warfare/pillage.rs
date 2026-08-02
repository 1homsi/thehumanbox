use super::super::ctx::ActionCtx;
use crate::sim::buildings::BuildingKind;
use crate::sim::simulation::Simulation;

fn target(sim: &Simulation, idx: usize, x: i32, y: i32) -> Option<usize> {
    let actor = sim.organisms.get(idx).filter(|actor| actor.alive)?;
    let mut candidates: Vec<usize> = sim
        .buildings
        .iter()
        .enumerate()
        .filter(|(_, building)| {
            let Some(owner) = building.owner_lineage.as_deref() else {
                return false;
            };
            let site = building.closest_footprint_tile(x, y);
            building.is_complete()
                && !building.decorative
                && !building.is_ruined()
                && !matches!(building.kind, BuildingKind::Bridge | BuildingKind::Well)
                && owner != actor.lineage_id
                && actor.attitude_toward(owner) < -0.20
                && (site.0 - x).abs() + (site.1 - y).abs() <= 3
        })
        .map(|(index, _)| index)
        .collect();
    candidates.sort_unstable_by_key(|&index| {
        let building = &sim.buildings[index];
        let site = building.closest_footprint_tile(x, y);
        ((site.0 - x).abs() + (site.1 - y).abs(), building.id)
    });
    candidates.first().copied()
}

pub fn can_apply(sim: &Simulation, idx: usize, x: i32, y: i32) -> bool {
    target(sim, idx, x, y).is_some()
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(index) = target(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    let (site_x, site_y, owner) = {
        let building = &ctx.sim.buildings[index];
        let site = building.closest_footprint_tile(ctx.ix, ctx.iy);
        (site.0, site.1, building.owner_lineage.clone().unwrap_or_default())
    };
    if super::stand_guard::active_guard(ctx.sim, &owner, site_x, site_y).is_some() {
        ctx.org_mut().energy = (ctx.org().energy - 0.025).max(0.0);
        ctx.org_mut().fear_level = (ctx.org().fear_level + 0.05).min(1.0);
        ctx.think("repelled by an infrastructure guard");
        ctx.event("war", "a guard prevented a building from being pillaged");
        return -0.012;
    }
    let (kind, owner, ruined) = {
        let building = &mut ctx.sim.buildings[index];
        building.damage = (building.damage_fraction() + 0.18).min(1.0);
        building.last_damage_tick = Some(ctx.tick);
        if building.damage_fraction() >= 1.0 {
            building.ruined_at_tick = Some(ctx.tick);
        }
        (
            building.kind,
            building.owner_lineage.clone().unwrap_or_default(),
            building.is_ruined(),
        )
    };
    ctx.sim.building_state_revision = ctx.sim.building_state_revision.wrapping_add(1);
    super::intercept_raid::mark_recent_attack(ctx.sim, ctx.idx, &owner, site_x, site_y, None);
    ctx.org_mut().energy = (ctx.org().energy - 0.045).max(0.0);
    ctx.think(if ruined {
        "ruining a rival building"
    } else {
        "pillaging a rival building"
    });
    ctx.discover("pillage", "damaged a rival building");
    ctx.event(
        "war",
        &format!(
            "damaged the {} of {}{}",
            kind.name(),
            owner,
            if ruined { " beyond use" } else { "" }
        ),
    );
    0.016
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::actions::{available_actions, try_apply};
    use crate::sim::buildings::Building;
    use crate::sim::spatial::SpatialIndex;

    #[test]
    fn pillage_requires_hostile_owned_building_and_never_conjures_wood() {
        let mut sim = Simulation::new(0xB111A6E);
        sim.buildings.clear();
        let actor = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let (x, y) = (sim.organisms[actor].x as i32, sim.organisms[actor].y as i32);
        let mut hut = Building::new(90, BuildingKind::Hut, x + 1, y, Some("rivals".into()), 0);
        hut.condition = 1.0;
        sim.buildings.push(hut);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!can_apply(&sim, actor, x, y));
        assert!(try_apply(&mut sim, actor, 98, x, y, &spatial).is_none());

        sim.organisms[actor]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            if index != actor {
                organism.alive = false;
            }
        }
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(available_actions(&sim, actor, x, y, &spatial).contains(&98));
        let wood_before = sim.organisms[actor].inv_wood;
        assert!(try_apply(&mut sim, actor, 98, x, y, &spatial).is_some());
        assert!((sim.buildings[0].damage_fraction() - 0.18).abs() < f32::EPSILON);
        assert_eq!(sim.organisms[actor].inv_wood, wood_before);
    }

    #[test]
    fn repeated_pillage_can_ruin_target_once_then_action_closes() {
        let mut sim = Simulation::new(0xB111A6E2);
        sim.buildings.clear();
        let actor = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let (x, y) = (sim.organisms[actor].x as i32, sim.organisms[actor].y as i32);
        sim.organisms[actor]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        let mut hut = Building::new(91, BuildingKind::Hut, x + 1, y, Some("rivals".into()), 0);
        hut.condition = 1.0;
        sim.buildings.push(hut);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        for _ in 0..6 {
            assert!(try_apply(&mut sim, actor, 98, x, y, &spatial).is_some());
        }
        assert!(sim.buildings[0].is_ruined());
        assert_eq!(sim.buildings[0].ruined_at_tick, Some(sim.tick_count));
        assert!(try_apply(&mut sim, actor, 98, x, y, &spatial).is_none());
    }

    #[test]
    fn present_assigned_guard_repels_pillage_without_building_damage() {
        let mut sim = Simulation::new(0x6A4DED);
        sim.buildings.clear();
        let attacker = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let defender = sim
            .organisms
            .iter()
            .position(|organism| organism.alive && organism.id != sim.organisms[attacker].id)
            .unwrap();
        let (x, y) = (sim.organisms[attacker].x as i32, sim.organisms[attacker].y as i32);
        sim.organisms[attacker]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        sim.organisms[defender].lineage_id = "rivals".into();
        sim.organisms[defender].x = (x + 1) as f32;
        sim.organisms[defender].y = y as f32;
        sim.organisms[defender].directive = format!("guard_area:{}:{}", x + 1, y);
        sim.organisms[defender].directive_until = sim.tick_count + 100;
        let mut hut = Building::new(92, BuildingKind::Hut, x + 1, y, Some("rivals".into()), 0);
        hut.condition = 1.0;
        sim.buildings.push(hut);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        let result = try_apply(&mut sim, attacker, 98, x, y, &spatial);

        assert!(result.is_some_and(|reward| reward < 0.0));
        assert_eq!(sim.buildings[0].damage_fraction(), 0.0);
    }
}
