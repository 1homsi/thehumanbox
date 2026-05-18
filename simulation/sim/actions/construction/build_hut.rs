

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood < 1
        || !matches!(ctx.tile, Tile::Grass | Tile::Sand | Tile::Snow)
    {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.set(ix, iy, Tile::Hut);
    ctx.think("building a hut");
    ctx.discover("shelter", "built a hut");
    0.04
}
