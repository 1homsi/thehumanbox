use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to restock impulse buys");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("restock impulse buys");
    ctx.event("chore", "restock impulse buys");
    0.03
}
