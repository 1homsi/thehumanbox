use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("bottle") == 0 {
        ctx.think("no bottle to stamp");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("stamp bottle");
    ctx.event("chore", "stamped a bottle");
    0.03
}
