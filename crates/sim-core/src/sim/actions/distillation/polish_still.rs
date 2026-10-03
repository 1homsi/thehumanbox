use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.02);
    ctx.think("polish still");
    ctx.event("chore", "polished the still");
    0.03
}
