use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("coffee", 1) {
        ctx.think("no beans for americano");
        return 0.005;
    }
    ctx.add_good("drink", 1);
    ctx.think("americano");
    ctx.event("chore", "drew a americano");
    0.06
}
