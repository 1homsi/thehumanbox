
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ix = ctx.ix;
    let iy = ctx.iy;
    let food_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter().any(|&(dx,dy)| matches!(ctx.sim.grid.get(ix+dx, iy+dy), Tile::Food));
    if ctx.org().inv_wood == 0 || (!food_near && !matches!(ctx.tile, Tile::Food)) { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("grafting a tree");
    ctx.discover("grafting", "grafted tree branches to improve yield");
    ctx.event("build", "grafted a new variety of fruit tree");
    0.010
}
