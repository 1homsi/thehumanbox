use super::super::ctx::ActionCtx;
use super::{start_project, ProjectSpec};
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

    start_project(
        ctx,
        ProjectSpec {
            kind: BuildingKind::Hut,
            thought: "building shelter",
            reward: 0.04 + storm_bonus + health_bonus,
        },
    )
}
