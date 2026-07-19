use super::super::agriculture::farm_ops;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if !(6000..9000).contains(&season_tick) {
        return 0.0;
    }
    let Some(harvest) = farm_ops::harvest_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
        return 0.0;
    };
    ctx.think(&format!(
        "gathering {} measures from the autumn harvest",
        harvest.yield_units
    ));
    ctx.discover("autumn_harvest", "harvested a bountiful autumn crop");
    0.012
}
