use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("pastry", 1);
    ctx.think("bake muffins");
    ctx.event("chore", "bake muffins");
    0.05
}
