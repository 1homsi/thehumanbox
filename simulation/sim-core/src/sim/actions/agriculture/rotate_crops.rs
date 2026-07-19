use super::super::ctx::ActionCtx;
use super::farm_ops::{self, FarmCare};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_rotation = ctx.sim.organisms[ctx.idx].discoveries.contains("crop_rotation");
    if !farm_ops::tend_crop(
        ctx.sim,
        ctx.idx,
        ctx.ix,
        ctx.iy,
        FarmCare::Rotate {
            practiced: has_rotation,
        },
    ) {
        return 0.0;
    }
    ctx.think("rotating the crops");
    ctx.discover("crop_rotation", "learned to rotate crops to restore the soil");
    ctx.event("build", "applied crop rotation to the fields");
    0.012
}
