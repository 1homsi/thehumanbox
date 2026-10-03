use super::super::agriculture::farm_ops;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick >= 3000 {
        return 0.0;
    }
    let crop = farm_ops::crop_for_plot(ctx.sim, ctx.idx, ctx.ix, ctx.iy, ctx.water_near);
    if farm_ops::plant_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy, crop, false).is_none() {
        return 0.0;
    }
    ctx.think(&format!("planting {} in the spring soil", crop.name()));
    ctx.discover("spring_planting", "planted the first spring crop");
    ctx.event("build", "sowed seeds in fertile ground at the start of spring");
    0.010
}
