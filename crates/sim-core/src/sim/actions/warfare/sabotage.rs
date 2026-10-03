use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    let mut hit = false;
    'sb: for dx in -3..=3 {
        for dy in -3..=3 {
            if matches!(ctx.sim.grid.get(ix + dx, iy + dy), Tile::Food) {
                ctx.sim.grid.set(ix + dx, iy + dy, Tile::Grass);
                hit = true;
                break 'sb;
            }
        }
    }
    if hit {
        ctx.think("sabotaging supplies");
        0.008
    } else {
        ctx.think("seeking something to spoil");
        0.0
    }
}
