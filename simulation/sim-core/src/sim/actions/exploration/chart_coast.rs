use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("looking for the shore");
        return 0.0;
    }
    let ms = ctx.org().traits.memory_strength;
    let (ix, iy) = (ctx.ix, ctx.iy);
    for dx in -8..=8 {
        for dy in -8..=8 {
            if ctx.sim.grid.get(ix + dx, iy + dy) == crate::world::tiles::Tile::Water {
                let strength = (0.65 - (dx.abs() + dy.abs()) as f32 * 0.025).max(0.18);
                Organism::remember(
                    &mut ctx.sim.organisms[ctx.idx].water_memory,
                    ix + dx,
                    iy + dy,
                    strength,
                    ms,
                );
            }
        }
    }
    ctx.sim
        .grid
        .leave_trail(ix, iy, crate::world::grid::TrailKind::Path, 0.8);
    ctx.think("charting the coast");
    ctx.discover("coastal-charts", "charted the coast");
    0.004
}
