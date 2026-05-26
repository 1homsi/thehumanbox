use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("looking for the shore");
        return 0.0;
    }
    let ms = ctx.org().traits.memory_strength;
    let (ix, iy) = (ctx.ix, ctx.iy);
    Organism::remember(&mut ctx.sim.organisms[ctx.idx].water_memory, ix, iy, 0.5, ms);
    ctx.think("charting the coast");
    ctx.discover("coastal-charts", "charted the coast");
    0.004
}
