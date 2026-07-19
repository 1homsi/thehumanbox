pub mod build_amphitheater;
pub mod build_aqueduct;
pub mod build_bridge;
pub mod build_dock;
pub mod build_drying_rack;
pub mod build_fence;
pub mod build_forge;
pub mod build_gate;
pub mod build_granary;
pub mod build_hut;
pub mod build_irrigation_canal;
pub mod build_kiln;
pub mod build_library;
pub mod build_lookout;
pub mod build_market;
pub mod build_observatory;
pub mod build_pasture;
pub mod build_paved_road;
pub mod build_quay;
pub mod build_road;
pub mod build_shrine;
pub mod build_signal_fire;
pub mod build_temple;
pub mod build_totem;
pub mod build_wall;
pub mod build_watchtower;
pub mod build_well;
pub mod dig_well_deep;
pub mod fortify;

use super::ctx::ActionCtx;
use crate::sim::tech::buildings::BuildingKind;

/// A world building started by an organism action.
///
/// The action owns only the contextual guard and narrative. Material
/// reservation, footprint validation, worker availability, entity creation,
/// and later labor progress all stay in the canonical civilization
/// construction system.
pub(crate) struct ProjectSpec<'a> {
    pub kind: BuildingKind,
    pub thought: &'a str,
    pub reward: f32,
}

pub(crate) fn start_project(ctx: &mut ActionCtx, spec: ProjectSpec<'_>) -> f32 {
    let lineage = ctx.lid.clone();
    if !crate::sim::civ::civ_tick::try_start_building_at(ctx.sim, &lineage, spec.kind, ctx.ix, ctx.iy) {
        return 0.0;
    }
    ctx.think(spec.thought);
    spec.reward
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        39 => build_wall::apply(ctx),
        40 => build_well::apply(ctx),
        41 => build_bridge::apply(ctx),
        42 => build_road::apply(ctx),
        43 => build_granary::apply(ctx),
        44 => build_watchtower::apply(ctx),
        45 => build_dock::apply(ctx),
        46 => build_totem::apply(ctx),
        47 => build_shrine::apply(ctx),
        48 => build_fence::apply(ctx),
        49 => build_hut::apply(ctx),
        50 => fortify::apply(ctx),
        166 => dig_well_deep::apply(ctx),
        167 => build_aqueduct::apply(ctx),
        168 => build_paved_road::apply(ctx),
        169 => build_gate::apply(ctx),
        170 => build_kiln::apply(ctx),
        171 => build_forge::apply(ctx),
        172 => build_market::apply(ctx),
        173 => build_amphitheater::apply(ctx),
        174 => build_library::apply(ctx),
        175 => build_observatory::apply(ctx),
        176 => build_temple::apply(ctx),
        177 => build_irrigation_canal::apply(ctx),
        178 => build_quay::apply(ctx),
        179 => build_signal_fire::apply(ctx),
        180 => build_drying_rack::apply(ctx),
        536 => build_pasture::apply(ctx),
        537 => build_lookout::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;
    use crate::sim::spatial::SpatialIndex;
    use crate::world::tiles::Tile;

    fn prepare_builder(seed: u64, x: i32, y: i32) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.buildings.clear();
        sim.organisms.truncate(1);
        let builder = &mut sim.organisms[0];
        builder.alive = true;
        builder.age = builder.max_age / 2;
        builder.energy = 1.0;
        builder.health = 1.0;
        builder.x = x as f32;
        builder.y = y as f32;
        for tile_y in y - 2..=y + 8 {
            for tile_x in x - 2..=x + 8 {
                sim.grid.set(tile_x, tile_y, Tile::Grass);
            }
        }
        sim
    }

    fn fund_builder(sim: &mut Simulation, kind: BuildingKind) {
        let cost = kind.construction_cost();
        sim.organisms[0].inv_wood = u8::try_from(cost.wood).expect("test wood cost fits inventory");
        sim.organisms[0].inv_stone = u8::try_from(cost.stone).expect("test stone cost fits inventory");
        sim.organisms[0].wealth = cost.wealth;
    }

    #[test]
    fn hut_action_requires_a_worker_and_duplicate_site_never_charges_twice() {
        let (x, y) = (100, 100);
        let mut sim = prepare_builder(0xAC71_0001, x, y);
        let cost = BuildingKind::Hut.construction_cost();
        fund_builder(&mut sim, BuildingKind::Hut);
        sim.organisms[0].energy = 0.1;

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(49, &mut ctx)
        };
        assert_eq!(reward, 0.0);
        assert!(sim.buildings.is_empty());
        assert_eq!(sim.organisms[0].inv_wood, cost.wood as u8);

        sim.organisms[0].energy = 1.0;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(49, &mut ctx)
        };
        assert!(reward > 0.0);
        assert_eq!(sim.buildings.len(), 1);
        assert_eq!(sim.buildings[0].kind, BuildingKind::Hut);
        assert!(!sim.buildings[0].is_operational());
        assert_eq!(sim.grid.get(x, y), Tile::Grass);
        assert!(!sim.active_structure_tiles.contains(&(x, y)));

        fund_builder(&mut sim, BuildingKind::Hut);
        let wood_before = sim.organisms[0].inv_wood;
        let stone_before = sim.organisms[0].inv_stone;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(49, &mut ctx)
        };
        assert_eq!(reward, 0.0);
        assert_eq!(sim.buildings.len(), 1);
        assert_eq!(sim.organisms[0].inv_wood, wood_before);
        assert_eq!(sim.organisms[0].inv_stone, stone_before);
    }

    #[test]
    fn library_and_greenhouse_actions_open_real_scaled_projects() {
        let (x, y) = (120, 120);
        let mut sim = prepare_builder(0xAC71_0002, x, y);
        sim.organisms[0].discoveries.insert("chronicle".into());
        let library_cost = BuildingKind::Library.construction_cost();
        assert!(library_cost.wood > 1);
        assert!(library_cost.stone > 1);
        fund_builder(&mut sim, BuildingKind::Library);

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(174, &mut ctx)
        };
        assert!(reward > 0.0);
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.organisms[0].inv_stone, 0);
        assert_eq!(sim.buildings[0].kind, BuildingKind::Library);
        assert_eq!(sim.buildings[0].condition, 0.0);
        assert!(!sim.organisms[0].discoveries.contains("library"));

        sim.buildings[0].condition = 0.99;
        sim.tick_count = 20;
        crate::sim::civ::civ_tick::tick_civ(&mut sim, None);
        assert!(sim.buildings[0].is_operational());
        assert!(sim.organisms[0].discoveries.contains("library"));

        let greenhouse_x = x + 8;
        sim.organisms[0].x = greenhouse_x as f32;
        sim.grid.set(greenhouse_x - 1, y, Tile::Rock);
        fund_builder(&mut sim, BuildingKind::Greenhouse);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, greenhouse_x, y, &spatial);
            crate::sim::actions::agriculture::apply(353, &mut ctx)
        };
        assert!(reward > 0.0);
        assert_eq!(sim.buildings.len(), 2);
        assert_eq!(sim.buildings[1].kind, BuildingKind::Greenhouse);
        assert!(!sim.buildings[1].is_operational());
        assert!(!sim.organisms[0].discoveries.contains("greenhouse"));
        assert!(sim
            .events
            .iter()
            .all(|event| event.etype != "built" || !event.detail.contains("greenhouse")));
    }

    #[test]
    fn well_project_reveals_water_and_knowledge_only_after_completion() {
        let (x, y) = (160, 160);
        let mut sim = prepare_builder(0xAC71_0003, x, y);
        fund_builder(&mut sim, BuildingKind::Well);

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            start_project(
                &mut ctx,
                ProjectSpec {
                    kind: BuildingKind::Well,
                    thought: "digging a test well",
                    reward: 0.05,
                },
            )
        };
        assert!(reward > 0.0);
        assert_eq!(sim.grid.get(x, y), Tile::Grass);
        assert!(!sim.organisms[0].discoveries.contains("well"));

        sim.buildings[0].condition = 0.99;
        sim.tick_count = 20;
        crate::sim::civ::civ_tick::tick_civ(&mut sim, None);
        assert!(sim.buildings[0].is_operational());
        assert_eq!(sim.grid.get(x, y), Tile::Water);
        assert!(sim.organisms[0].discoveries.contains("well"));
    }
}
