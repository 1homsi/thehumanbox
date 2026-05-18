
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("nothing blocking the path here");
        return 0.0;
    }
    ctx.think("heaving stones aside");
    ctx.discover("land_clearing", "cleared boulders and debris to open usable land");
    ctx.event("build", "removed rocky obstacles to clear land for use");
    0.006
}
