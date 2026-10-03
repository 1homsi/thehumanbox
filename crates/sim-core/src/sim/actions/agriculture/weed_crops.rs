use super::super::ctx::ActionCtx;
use super::farm_ops::{self, FarmCare};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !farm_ops::tend_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy, FarmCare::Weed) {
        return 0.0;
    }
    ctx.think("tending crops");
    ctx.discover("horticulture", "learned careful crop tending");
    0.006
}
