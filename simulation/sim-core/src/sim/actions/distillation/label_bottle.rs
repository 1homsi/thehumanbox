use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("bottle") == 0 {
        ctx.think("no bottle to label");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("label bottle");
    ctx.event("chore", "labeled a bottle");
    0.03
}
