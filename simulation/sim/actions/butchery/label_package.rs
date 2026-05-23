use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("preserved") == 0 {
        ctx.think("nothing to label");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("label package");
    ctx.event("chore", "labeled a package");
    0.03
}
