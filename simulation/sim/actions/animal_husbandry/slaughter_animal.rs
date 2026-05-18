
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food += 2;
    ctx.think("providing for kin");
    ctx.event("build", "slaughtered an animal to feed the group");
    0.008
}
