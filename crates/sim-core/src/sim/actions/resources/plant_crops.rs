use super::super::agriculture::farm_ops;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let crop = farm_ops::crop_for_plot(ctx.sim, ctx.idx, ctx.ix, ctx.iy, ctx.water_near);
    if farm_ops::plant_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy, crop, false).is_none() {
        return 0.0;
    }
    ctx.think(&format!("planting {}", crop.name()));
    ctx.discover("farm", "planted a crop field");
    0.014
}
