
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let stranger = ctx.near.iter().any(|&k| ctx.sim.organisms[k].lineage_id != lid);
    if !stranger {
        ctx.think("need another group present to set up a route");
        return 0.0;
    }
    ctx.think("agreeing on message relay points");
    ctx.discover("postal_route", "established the first postal relay route between groups");
    ctx.event("trade", "set up a postal route connecting two settlements");
    0.015
}
