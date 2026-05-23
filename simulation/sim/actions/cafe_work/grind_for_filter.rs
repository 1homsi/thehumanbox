use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("coffee", 1);
    ctx.think("grind for filter");
    ctx.event("chore", "grind for filter");
    0.04
}
