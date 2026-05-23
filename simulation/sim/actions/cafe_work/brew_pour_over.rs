use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("coffee", 1) {
        ctx.think("no beans for pour-over");
        return 0.005;
    }
    ctx.add_good("drink", 1);
    ctx.think("pour-over");
    ctx.event("chore", "brewed pour-over");
    0.05
}
