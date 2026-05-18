//! Action 346: tend an orchard near a food tile.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ix = ctx.ix;
    let iy = ctx.iy;
    let food_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter().any(|&(dx,dy)| matches!(ctx.sim.grid.get(ix+dx, iy+dy), Tile::Food));
    if !food_near && !matches!(ctx.tile, Tile::Food) { return 0.0; }
    ctx.org_mut().health = (ctx.org().health + 0.02).min(1.0);
    ctx.think("tending the orchard");
    ctx.discover("orcharding", "cultivated the first orchard");
    0.007
}
