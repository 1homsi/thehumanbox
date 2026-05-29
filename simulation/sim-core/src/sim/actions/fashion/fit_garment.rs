use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("garment") == 0 {
        ctx.think("nothing to fit");
        return 0.005;
    }
    ctx.add_literacy(0.005);
    let n = ctx.comfort_kin(0.01);
    ctx.think("fit garment");
    ctx.event("chore", "fit a garment");
    0.04 + n as f32 * 0.005
}
