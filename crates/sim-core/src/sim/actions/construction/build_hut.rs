use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
use crate::sim::civ::civ_tick::{lineage_can_afford_construction, wants_manor};
use crate::sim::era::Era;
use crate::sim::tech::buildings::BuildingKind;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass | Tile::Sand | Tile::Snow) {
        return 0.0;
    }
    // Nobody raises a hut while the tribe already has a bed for everyone.
    if !crate::sim::civ::vacancy::short_of_housing(ctx.sim, &ctx.lid) {
        ctx.think("there is room enough at home");
        return 0.0;
    }

    // Reward scales with environmental need: storm exposure and poor health
    let weather_kind = ctx.sim.weather.kind;
    let health = ctx.sim.organisms[ctx.idx].health;
    let storm_bonus = if weather_kind >= 2 {
        0.12
    } else if weather_kind == 1 {
        0.04
    } else {
        0.0
    };
    let health_bonus = if health < 0.5 { (0.5 - health) * 0.08 } else { 0.0 };

    // A tribe whose era has houses raises the best home it can pay for; a hut
    // is the fallback while it cannot, so growth never waits on timber and stone.
    let lid = ctx.lid.clone();
    let era = ctx.sim.lineage_eras.get(&lid).copied().unwrap_or(Era::PreStone);
    // A rich tribe of the Medieval age or later raises a manor first.
    let population = ctx
        .sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lid)
        .count();
    let kind = if wants_manor(ctx.sim, &lid, era, population) {
        BuildingKind::Manor
    } else {
        [
            BuildingKind::Apartment,
            BuildingKind::TownHouse,
            BuildingKind::House,
        ]
        .into_iter()
        .find(|kind| era >= kind.era_unlock() && lineage_can_afford_construction(ctx.sim, &lid, *kind))
        .unwrap_or(BuildingKind::Hut)
    };

    start_project(
        ctx,
        ProjectSpec {
            kind,
            thought: "building shelter",
            reward: 0.04 + storm_bonus + health_bonus,
        },
    )
}
