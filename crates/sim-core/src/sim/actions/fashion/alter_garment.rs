use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("nothing to alter");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("alter garment");
    ctx.event("chore", "altered a garment");
    0.04
}
