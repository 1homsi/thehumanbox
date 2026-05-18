
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("no water to drain");
        return 0.0;
    }
    ctx.think("digging drainage channels");
    ctx.discover("drainage", "drained a swamp to reclaim usable land");
    ctx.event("build", "dug channels to drain standing water from the land");
    0.008
}
