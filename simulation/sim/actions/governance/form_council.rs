
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let is_elder = ctx.sim.organisms[ctx.idx].is_elder;
    if !is_elder {
        ctx.think("only an elder can form a council");
        return 0.0;
    }
    if ctx.kin.len() < 2 {
        ctx.think("not enough kin to form a council");
        return 0.0;
    }
    ctx.think("forming a governing council");
    ctx.discover("council", "established a council of elders and kin");
    ctx.event("governance", "formed a formal council to govern the tribe");
    0.015
}
