use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.good("drink") == 0 {
        ctx.think("no drink to call");
        return 0.005;
    }
    ctx.think("call drink");
    ctx.event("chore", "called a drink");
    0.03
}
