use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("adjust drape");
    ctx.event("chore", "adjusted the drape");
    0.03
}
