use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("ground", 1) {
        ctx.think("no ground meat to stuff");
        return 0.005;
    }
    ctx.add_good("sausage", 1);
    ctx.think("stuff sausage");
    ctx.event("chore", "stuffed sausages");
    0.06
}
