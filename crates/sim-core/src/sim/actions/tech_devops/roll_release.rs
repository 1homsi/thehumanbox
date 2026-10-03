use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.add_wealth(1);
    ctx.think("roll a release");
    ctx.event("chore", "roll a release");
    0.06
}
