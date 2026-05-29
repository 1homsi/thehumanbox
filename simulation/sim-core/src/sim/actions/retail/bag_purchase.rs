use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("stock", 1) {
        ctx.think("no stock to bag a purchase");
        return 0.005;
    }
    ctx.add_wealth(2);
    ctx.think("bag a purchase");
    ctx.event("chore", "bag a purchase");
    0.07
}
