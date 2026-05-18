

use crate::world::grid::{TrailKind, WorldGrid};
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || !matches!(ctx.tile, Tile::Grass) { return 0.0; }
    let (ix, iy) = (ctx.ix, ctx.iy);
    for dx in -3..=3 {
        for dy in -3..=3 {
            let i2 = WorldGrid::idx(ix + dx, iy + dy);
            if i2 < ctx.sim.grid.fertility.len() {
                ctx.sim.grid.fertility[i2] = (ctx.sim.grid.fertility[i2] + 0.04).min(0.96);
            }
        }
    }
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 1.0);
    ctx.think("cutting an irrigation canal");
    ctx.discover("canals", "cut an irrigation canal");
    0.014
}
