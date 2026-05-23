use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("pastry", 1);
    ctx.think("bake danish");
    ctx.event("chore", "bake danish");
    0.05
}
