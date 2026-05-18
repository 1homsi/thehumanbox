
use crate::organism::organism::Organism;
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass) || !ctx.chance(0.5) {
        ctx.think("no good tree to climb");
        return 0.0;
    }
    let ms = ctx.org().traits.memory_strength;
    let (ix, iy) = (ctx.ix, ctx.iy);
    for dx in -8..=8 {
        for dy in -8..=8 {
            if matches!(ctx.sim.grid.get(ix + dx, iy + dy), Tile::Food) {
                Organism::remember(
                    &mut ctx.sim.organisms[ctx.idx].food_memory,
                    ix + dx, iy + dy, 0.4, ms,
                );
            }
        }
    }
    ctx.think("scanning from a tree");
    0.004
}
