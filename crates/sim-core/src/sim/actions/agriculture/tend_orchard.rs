use super::super::ctx::ActionCtx;
use super::farm_ops::{self, FarmCare};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !farm_ops::tend_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy, FarmCare::Tend) {
        return 0.0;
    }
    ctx.think("tending the orchard");
    ctx.discover("orcharding", "cultivated the first orchard");
    0.007
}
