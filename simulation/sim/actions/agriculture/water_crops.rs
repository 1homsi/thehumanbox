//! Action 339: water crops using a nearby water source.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || !matches!(ctx.tile, Tile::Food) { return 0.0; }
    ctx.org_mut().energy = (ctx.org().energy + 0.05).min(1.0);
    ctx.think("watering the crops");
    ctx.discover("irrigation_farming", "discovered irrigation farming");
    0.008
}
