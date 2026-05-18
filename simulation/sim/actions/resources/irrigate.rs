//! Action 37: irrigate. Bumps fertility in a 5x5 patch around the
//! org if water is nearby and standing on grass.

use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || !matches!(ctx.tile, Tile::Grass) {
        return 0.0;
    }
    let (ix, iy) = (ctx.ix, ctx.iy);
    for dx in -2..=2 {
        for dy in -2..=2 {
            let i2 = WorldGrid::idx(ix + dx, iy + dy);
            if i2 < ctx.sim.grid.fertility.len() {
                ctx.sim.grid.fertility[i2] = (ctx.sim.grid.fertility[i2] + 0.02).min(0.92);
            }
        }
    }
    ctx.think("irrigating the field");
    ctx.discover("irrigation", "dug an irrigation channel");
    0.01
}
