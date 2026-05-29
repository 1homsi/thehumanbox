use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_comfort(0.015);
    ctx.think("mop the store");
    ctx.event("chore", "mop the store");
    0.03
}
