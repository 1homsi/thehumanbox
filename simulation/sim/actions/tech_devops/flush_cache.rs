use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("flush cache");
    ctx.event("chore", "flush cache");
    0.03
}
