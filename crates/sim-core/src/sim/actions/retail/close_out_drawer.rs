use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("close out drawer");
    ctx.event("chore", "close out drawer");
    0.04
}
