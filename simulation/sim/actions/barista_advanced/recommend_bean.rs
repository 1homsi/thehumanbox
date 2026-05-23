use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.01);
    ctx.add_literacy(0.003);
    ctx.think("recommend a bean");
    ctx.event("chore", "recommended a bean");
    0.04 + n as f32 * 0.005
}
