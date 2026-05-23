use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("mash") == 0 {
        ctx.think("nothing to stir");
        return 0.005;
    }
    ctx.add_literacy(0.003);
    ctx.think("stir mash");
    ctx.event("chore", "stirred the mash");
    0.03
}
