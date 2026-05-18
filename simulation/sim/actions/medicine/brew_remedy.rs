//! Action 248: use inv_food to brew medicine; discover "herbal_medicine".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_food == 0 {
        ctx.think("no ingredients for remedy");
        return 0.0;
    }
    ctx.sim.organisms[ctx.idx].inv_food -= 1;
    ctx.sim.organisms[ctx.idx].health = (ctx.sim.organisms[ctx.idx].health + 0.04).min(1.0);
    ctx.think("brewing a herbal remedy");
    ctx.discover("herbal_medicine", "brewed a herbal remedy for the first time");
    0.015
}
