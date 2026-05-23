use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("pastry", 1);
    ctx.think("bake croissants");
    ctx.event("chore", "bake croissants");
    0.05
}
