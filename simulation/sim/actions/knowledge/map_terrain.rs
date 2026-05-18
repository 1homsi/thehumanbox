//! Action 70: map terrain - sweeps a 25x25 box around the org and
//! commits found food/water tiles to its memory.

use crate::organism::organism::Organism;
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let ms = ctx.org().traits.memory_strength;
    let (ix, iy) = (ctx.ix, ctx.iy);
    for dx in -12..=12 {
        for dy in -12..=12 {
            match ctx.sim.grid.get(ix + dx, iy + dy) {
                Tile::Food  => Organism::remember(
                    &mut ctx.sim.organisms[ctx.idx].food_memory,  ix + dx, iy + dy, 0.5, ms),
                Tile::Water => Organism::remember(
                    &mut ctx.sim.organisms[ctx.idx].water_memory, ix + dx, iy + dy, 0.5, ms),
                _ => {}
            }
        }
    }
    ctx.think("mapping the terrain");
    ctx.discover("cartography", "drew the first map");
    0.004
}
