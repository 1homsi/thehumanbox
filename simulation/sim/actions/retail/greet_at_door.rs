use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.01);
    ctx.think("greet at door");
    ctx.event("chore", "greeted at the door");
    0.03 + n as f32 * 0.005
}
