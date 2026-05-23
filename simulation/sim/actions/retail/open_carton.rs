use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("stock", 1);
    ctx.think("open a carton");
    ctx.event("chore", "open a carton");
    0.04
}
