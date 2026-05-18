//! Action 285: keep all inv to self; comfort +0.02 but boredom -0.05.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_goods = ctx.sim.organisms[ctx.idx].inv_food > 0
        || ctx.sim.organisms[ctx.idx].inv_wood > 0
        || ctx.sim.organisms[ctx.idx].inv_stone > 0;
    if !has_goods {
        ctx.think("nothing worth hoarding");
        return 0.0;
    }
    ctx.sim.organisms[ctx.idx].comfort =
        (ctx.sim.organisms[ctx.idx].comfort + 0.02).min(1.0);
    ctx.sim.organisms[ctx.idx].boredom =
        (ctx.sim.organisms[ctx.idx].boredom - 0.05).max(0.0);
    ctx.think("hoarding");
    0.003
}
