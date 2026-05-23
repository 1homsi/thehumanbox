use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("drink") == 0 {
        ctx.think("no drink to ring up");
        return 0.005;
    }
    ctx.add_wealth(1);
    ctx.think("ring register");
    ctx.event("chore", "rang up a drink");
    0.05
}
