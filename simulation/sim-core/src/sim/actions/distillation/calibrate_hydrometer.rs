use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_literacy(0.006);
    ctx.think("calibrate hydrometer");
    ctx.event("chore", "calibrated the hydrometer");
    0.04
}
