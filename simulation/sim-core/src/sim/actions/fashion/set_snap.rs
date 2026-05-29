use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("no garment for snap");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("set snap");
    ctx.event("chore", "set snap");
    0.03
}
