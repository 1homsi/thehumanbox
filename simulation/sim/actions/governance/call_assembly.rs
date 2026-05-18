
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no kin to call to assembly");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.1).max(0.0);
    }
    ctx.think("calling the tribe to assembly");
    ctx.discover("assembly", "called a formal gathering of all kin");
    ctx.event("governance", "summoned all kin to a tribal assembly");
    0.012
}
