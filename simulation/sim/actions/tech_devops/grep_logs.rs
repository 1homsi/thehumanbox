use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("incident") == 0 {
        ctx.add_literacy(0.003);
        return 0.03;
    }
    ctx.add_literacy(0.005);
    ctx.think("grep logs");
    ctx.event("chore", "grep logs");
    0.04
}
