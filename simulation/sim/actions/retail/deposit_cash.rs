use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("deposit cash");
    ctx.event("chore", "deposit cash");
    0.04
}
