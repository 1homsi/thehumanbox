use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.006);
    let n = ctx.comfort_kin(0.02);
    ctx.think("roll back");
    ctx.event("chore", "rolled back a release");
    0.05 + n as f32 * 0.005
}
