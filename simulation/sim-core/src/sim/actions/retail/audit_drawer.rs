use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("audit drawer");
    ctx.event("chore", "audit drawer");
    0.04
}
