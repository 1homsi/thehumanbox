use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("stock", 1) {
        ctx.think("no stock to ring up a sale");
        return 0.005;
    }
    ctx.add_wealth(2);
    ctx.think("ring up a sale");
    ctx.event("chore", "ring up a sale");
    0.07
}
