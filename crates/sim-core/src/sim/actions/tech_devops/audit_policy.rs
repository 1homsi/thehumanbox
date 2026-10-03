use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.005);
    ctx.add_literacy(0.005);
    ctx.think("audit a policy");
    ctx.event("chore", "audit a policy");
    0.05
}
