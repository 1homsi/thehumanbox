use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("audit temperature");
    ctx.event("chore", "audited temperature");
    0.04
}
