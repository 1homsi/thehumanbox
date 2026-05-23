use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("stock") == 0 {
        ctx.think("no stock to tag an item");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("tag an item");
    ctx.event("chore", "tag an item");
    0.03
}
