use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("preserved") == 0 {
        ctx.think("nothing to seal");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("vacuum seal");
    ctx.event("chore", "vacuum-sealed a package");
    0.04
}
