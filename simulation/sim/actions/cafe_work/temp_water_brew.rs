use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("coffee", 1);
    ctx.think("tempered brew water");
    ctx.event("chore", "tempered brew water");
    0.04
}
