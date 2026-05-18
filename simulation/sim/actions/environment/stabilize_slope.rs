//! Action 378: stabilize a slope. Needs rock nearby and inv_wood.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near || ctx.org().inv_wood == 0 {
        ctx.think("need a rocky slope and timber to stabilize it");
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("driving posts into the hillside");
    ctx.discover("slope_stabilization", "braced a slope against erosion with timber and rock");
    ctx.event("build", "stabilized a crumbling slope with wooden supports and packed stone");
    0.008
}
