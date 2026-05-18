
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ix = ctx.ix;
    let iy = ctx.iy;
    let grass_near = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter().any(|&(dx,dy)| matches!(ctx.sim.grid.get(ix+dx, iy+dy), Tile::Grass));
    if !grass_near && !matches!(ctx.tile, Tile::Grass) { return 0.0; }
    ctx.think("breeding animals");
    ctx.discover("animal_breeding", "began selectively breeding animals");
    ctx.event("build", "bred animals to strengthen the herd");
    0.010
}
