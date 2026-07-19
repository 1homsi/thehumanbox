use super::super::ctx::ActionCtx;
use super::farm_ops;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(harvest) = farm_ops::harvest_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    ctx.think(&format!("harvesting {} measures of grain", harvest.yield_units));
    ctx.discover("grain_harvest", "harvested grain for the first time");
    ctx.event("build", "gathered a grain harvest from the field");
    0.010
}
