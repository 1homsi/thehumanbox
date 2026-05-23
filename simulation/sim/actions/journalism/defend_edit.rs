use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("article") == 0 {
        ctx.think("nothing to defend");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("defend edit");
    ctx.event("chore", "defended a passage");
    0.04
}
