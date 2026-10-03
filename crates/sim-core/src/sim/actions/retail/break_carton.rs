use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("stock", 1);
    ctx.think("break down a carton");
    ctx.event("chore", "break down a carton");
    0.04
}
