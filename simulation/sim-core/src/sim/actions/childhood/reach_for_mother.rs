use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.01);
    ctx.add_comfort(0.02);
    ctx.think("reach for mother");
    ctx.event("chore", "reach for mother");
    0.03 + n as f32 * 0.005
}
