
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("rotating the crops");
    ctx.discover("crop_rotation", "learned to rotate crops to restore the soil");
    ctx.event("build", "applied crop rotation to the fields");
    0.008
}
