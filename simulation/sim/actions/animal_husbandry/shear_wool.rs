//! Action 359: shear wool from an animal; stored as inv_wood (fiber).
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_wood += 1;
    ctx.think("shearing wool");
    ctx.discover("wool_shearing", "sheared wool from an animal for the first time");
    ctx.event("build", "collected wool from the flock");
    0.008
}
