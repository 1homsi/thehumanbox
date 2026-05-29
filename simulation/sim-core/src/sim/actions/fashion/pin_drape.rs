use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.003);
    ctx.think("pin drape");
    ctx.event("chore", "pinned the drape");
    0.03
}
