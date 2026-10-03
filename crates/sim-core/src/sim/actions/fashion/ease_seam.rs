use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("no garment to ease");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("ease");
    ctx.event("chore", "ease a seam");
    0.03
}
