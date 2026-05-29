use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("stock", 1) {
        ctx.think("no stock to scan an item");
        return 0.005;
    }
    ctx.add_wealth(2);
    ctx.think("scan an item");
    ctx.event("chore", "scan an item");
    0.07
}
