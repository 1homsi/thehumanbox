
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_wood = ctx.org_mut().inv_wood.saturating_add(1);
    ctx.think("shearing wool");
    ctx.discover("wool_shearing", "sheared wool from an animal for the first time");
    ctx.event("build", "collected wool from the flock");
    0.008
}
