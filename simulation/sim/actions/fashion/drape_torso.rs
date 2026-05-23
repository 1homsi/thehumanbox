use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("drape torso");
    ctx.event("chore", "draped the torso");
    0.03
}
