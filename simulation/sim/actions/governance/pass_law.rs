
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let is_elder = ctx.sim.organisms[ctx.idx].is_elder;
    if !is_elder && ctx.kin.len() < 3 {
        ctx.think("lacks authority to pass a law");
        return 0.0;
    }
    ctx.think("passing a new law");
    ctx.discover("law", "enacted a binding law for the tribe");
    ctx.event("governance", "passed a law to govern tribal conduct");
    0.012
}
