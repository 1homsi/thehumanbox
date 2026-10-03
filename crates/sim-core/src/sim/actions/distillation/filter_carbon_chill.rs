use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("spirit") == 0 && ctx.good("bottled_spirit") == 0 {
        ctx.think("nothing to filter");
        return 0.005;
    }
    ctx.add_literacy(0.005);
    ctx.think("carbon chill filter");
    ctx.event("chore", "chill-filtered the spirit");
    0.04
}
