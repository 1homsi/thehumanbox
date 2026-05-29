use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("incident") == 0 {
        ctx.add_literacy(0.003);
        return 0.03;
    }
    ctx.add_literacy(0.005);
    ctx.think("filter logs");
    ctx.event("chore", "filter logs");
    0.04
}
