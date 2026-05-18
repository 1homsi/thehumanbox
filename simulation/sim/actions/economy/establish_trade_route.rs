//! Action 287: with a stranger present; discover "trade_route".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let has_stranger = ctx.near.iter().copied()
        .any(|k| ctx.sim.organisms[k].lineage_id != lid);
    if !has_stranger {
        ctx.think("no foreign partner to establish a route with");
        return 0.0;
    }
    ctx.think("negotiating a trade route");
    ctx.discover("trade_route", "established a trade route with a foreign lineage");
    ctx.event("trade", "opened a formal trade route");
    0.015
}
