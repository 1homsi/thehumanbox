use super::super::ctx::ActionCtx;
use super::farm_ops;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let crop = farm_ops::crop_for_plot(ctx.sim, ctx.idx, ctx.ix, ctx.iy, ctx.water_near);
    if farm_ops::plant_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy, crop, true).is_none() {
        return 0.0;
    }
    ctx.think(&format!("sowing {} seeds", crop.name()));
    ctx.event("build", &format!("sowed a field of {}", crop.name()));
    0.006
}
