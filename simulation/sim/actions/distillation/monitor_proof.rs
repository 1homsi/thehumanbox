use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("spirit") == 0 && ctx.good("bottled_spirit") == 0 {
        ctx.think("nothing to proof");
        return 0.005;
    }
    ctx.add_literacy(0.004);
    ctx.think("monitor proof");
    ctx.event("chore", "measured proof");
    0.03
}
