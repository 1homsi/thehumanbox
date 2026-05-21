
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Ash | Tile::Grass) { return 0.0; }

    // Composting restores fertility to depleted or ashy land - restores burned areas
    let has_composting = ctx.sim.organisms[ctx.idx].discoveries.contains("composting");
    let fertility_gain = if has_composting { 0.12 } else { 0.06 };
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, fertility_gain);
    // Also restore to adjacent tiles to create spreading soil improvement
    for (dx, dy) in [(-1,0),(1,0),(0,-1),(0,1)] {
        ctx.sim.grid.restore_fertility(ctx.ix + dx, ctx.iy + dy, fertility_gain * 0.4);
    }

    ctx.think("building a compost heap");
    ctx.discover("composting", "started composting organic waste");
    ctx.event("build", "established a compost heap to enrich the soil");
    0.012
}
