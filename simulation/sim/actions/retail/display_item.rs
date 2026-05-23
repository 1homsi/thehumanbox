use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to display an item");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("display an item");
    ctx.event("chore", "display an item");
    0.03
}
