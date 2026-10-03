use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("no garment to press");
        return 0.005;
    }
    ctx.add_comfort(0.02);
    ctx.think("press garment");
    ctx.event("chore", "pressed a garment");
    0.03
}
