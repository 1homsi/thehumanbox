use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.add_wealth(2);
    ctx.think("close cafe books");
    ctx.event("chore", "closed out the cafe's books");
    0.06
}
