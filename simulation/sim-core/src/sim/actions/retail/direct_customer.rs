use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.01);
    ctx.add_literacy(0.002);
    ctx.think("direct customer");
    ctx.event("chore", "directed a customer");
    0.03 + n as f32 * 0.005
}
