
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let hut_near = [(-1i32,0),(1,0),(0,-1i32),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter()
        .any(|&(dx, dy)| matches!(ctx.sim.grid.get(ctx.ix + dx, ctx.iy + dy), Tile::Hut));
    if !hut_near {
        ctx.think("no hut to post a notice on");
        return 0.0;
    }
    ctx.think("nailing a notice to the wall");
    ctx.discover("posting_notices", "established a place for public notices");
    ctx.event("build", "posted a public notice near a hut to inform the community");
    0.007
}
