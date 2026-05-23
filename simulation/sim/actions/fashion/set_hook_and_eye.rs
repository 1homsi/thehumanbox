use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("no garment for hook and eye");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("set hook and eye");
    ctx.event("chore", "set hook and eye");
    0.03
}
