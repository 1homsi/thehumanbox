use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("incident") == 0 {
        ctx.add_literacy(0.003);
        return 0.03;
    }
    ctx.add_literacy(0.005);
    ctx.think("pull logs");
    ctx.event("chore", "pull logs");
    0.04
}
