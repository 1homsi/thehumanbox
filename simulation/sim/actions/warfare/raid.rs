
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let near = ctx.near.clone();
    let r = ctx.sim.do_raid(ctx.idx, &near, false);
    if r <= 0.0 { ctx.think("looking for a target"); }
    r
}
