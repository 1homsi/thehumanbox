use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.01);
    ctx.think("greet customer");
    ctx.event("chore", "greeted a customer");
    0.03 + n as f32 * 0.003
}
