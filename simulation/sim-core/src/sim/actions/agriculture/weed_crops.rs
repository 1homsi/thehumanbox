use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food) {
        return 0.0;
    }

    // Weeding restores a small amount of fertility by removing competing plants
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, 0.02);

    ctx.org_mut().energy = (ctx.org().energy + 0.02).min(1.0);
    ctx.think("tending crops");
    ctx.discover("horticulture", "learned careful crop tending");
    0.006
}
