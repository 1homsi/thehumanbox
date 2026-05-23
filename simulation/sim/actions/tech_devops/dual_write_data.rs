use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.005);
    ctx.think("dual-write data");
    ctx.event("chore", "dual-write data");
    0.05
}
