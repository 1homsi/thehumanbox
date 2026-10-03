use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.008);
    let ms = ctx.org().traits.memory_strength;
    Organism::remember(&mut ctx.sim.organisms[ctx.idx].food_memory, ix, iy, 0.4, ms);
    ctx.think("noting a landmark");
    ctx.discover("landmarks", "noted a landmark");
    0.003
}
