use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("coffee", 1) {
        ctx.think("no beans pulled");
        return 0.005;
    }
    ctx.add_good("drink", 1);
    ctx.think("pull espresso");
    ctx.event("chore", "pulled a shot of espresso");
    0.06
}
