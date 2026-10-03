use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_goods = ctx.sim.organisms[ctx.idx].inv_food > 0
        || ctx.sim.organisms[ctx.idx].inv_wood > 0
        || ctx.sim.organisms[ctx.idx].inv_stone > 0;
    if !has_goods {
        ctx.think("nothing to weigh");
        return 0.0;
    }
    ctx.think("weighing goods carefully");
    ctx.discover("measurement", "developed a system for weighing goods");
    ctx.event("trade", "weighed goods to ensure fair exchange");
    0.006
}
