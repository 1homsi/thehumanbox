use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_piety(0.005);
    ctx.add_wealth(1);
    ctx.think("close store");
    ctx.event("chore", "closed the store");
    0.05
}
