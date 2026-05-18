//! Action 326: decorate a home near a hut tile.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ix = ctx.ix;
    let iy = ctx.iy;
    let hut_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter().any(|&(dx,dy)| matches!(ctx.sim.grid.get(ix+dx, iy+dy), Tile::Hut));
    if !hut_near && !matches!(ctx.tile, Tile::Hut) { return 0.0; }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.06).min(1.0);
    ctx.think("decorating the home");
    ctx.discover("home_decoration", "adorned a dwelling for the first time");
    ctx.event("build", "decorated the interior of the home");
    0.008
}
