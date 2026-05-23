use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("pastry", 1);
    ctx.think("bake scones");
    ctx.event("chore", "bake scones");
    0.05
}
