
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || !matches!(ctx.tile, Tile::Food) { return 0.0; }

    // Watering restores soil fertility — the core of making farming matter
    let has_irrigation = ctx.sim.organisms[ctx.idx].discoveries.contains("irrigation_farming")
        || ctx.sim.organisms[ctx.idx].discoveries.contains("irrigation");
    let fertility_gain = if has_irrigation { 0.06 } else { 0.03 };
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, fertility_gain);

    ctx.org_mut().energy = (ctx.org().energy + 0.05).min(1.0);
    ctx.think("watering the crops");
    ctx.discover("irrigation_farming", "discovered irrigation farming");
    0.012
}
