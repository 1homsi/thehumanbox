
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ix = ctx.ix;
    let iy = ctx.iy;
    let hut_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter().any(|&(dx,dy)| matches!(ctx.sim.grid.get(ix+dx, iy+dy), Tile::Hut));
    if !hut_near && !matches!(ctx.tile, Tile::Hut) { return 0.0; }
    if ctx.org().inv_food == 0 { return 0.0; }
    ctx.org_mut().inv_food -= 1;
    ctx.think("storing grain for winter");
    ctx.discover("grain_storage", "stored grain reserves for the first time");
    ctx.event("build", "stocked grain in the communal store");
    0.008
}
