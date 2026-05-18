
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_goods = ctx.sim.organisms[ctx.idx].inv_food > 0
        || ctx.sim.organisms[ctx.idx].inv_wood > 0
        || ctx.sim.organisms[ctx.idx].inv_stone > 0;
    if !has_goods {
        ctx.think("nothing to price");
        return 0.0;
    }
    ctx.think("setting a price");
    ctx.discover("trade_value", "declared the value of goods");
    ctx.event("trade", "declared the value of their goods");
    0.005
}
