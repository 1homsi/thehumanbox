use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.004);
    ctx.think("evaluate drape");
    ctx.event("chore", "evaluated the drape");
    0.03
}
