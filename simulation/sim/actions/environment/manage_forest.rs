//! Action 375: manage a forest. Needs at least one Grass neighbour.
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let grass_near = [(-1i32,0),(1,0),(0,-1i32),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter()
        .any(|&(dx, dy)| matches!(ctx.sim.grid.get(ctx.ix + dx, ctx.iy + dy), Tile::Grass));
    if !grass_near {
        ctx.think("searching for woodland to manage");
        return 0.0;
    }
    ctx.think("tending the forest carefully");
    ctx.discover("forest_management", "began managing a forest sustainably");
    ctx.event("build", "practised selective harvesting and replanting in the forest");
    0.008
}
