use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.005);
    ctx.add_literacy(0.005);
    ctx.think("revoke a token");
    ctx.event("chore", "revoke a token");
    0.05
}
