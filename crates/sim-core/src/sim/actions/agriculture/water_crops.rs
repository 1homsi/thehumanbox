use super::super::ctx::ActionCtx;
use super::farm_ops::{self, FarmCare};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        return 0.0;
    }
    let has_irrigation = ctx.sim.organisms[ctx.idx]
        .discoveries
        .contains("irrigation_farming")
        || ctx.sim.organisms[ctx.idx].discoveries.contains("irrigation");
    if !farm_ops::tend_crop(
        ctx.sim,
        ctx.idx,
        ctx.ix,
        ctx.iy,
        FarmCare::Water {
            irrigated: has_irrigation,
        },
    ) {
        return 0.0;
    }
    ctx.think("watering the crops");
    ctx.discover("irrigation_farming", "discovered irrigation farming");
    0.012
}
