use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("coffee", 1);
    ctx.think("calibrate the grind");
    ctx.event("chore", "calibrate the grind");
    0.04
}
