
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_food == 0 {
        ctx.think("no goods to send with the caravan");
        return 0.0;
    }
    let lid = ctx.lid.clone();
    let has_stranger = ctx.near.iter().copied()
        .any(|k| ctx.sim.organisms[k].lineage_id != lid);
    if !has_stranger {
        ctx.think("no destination for the caravan");
        return 0.0;
    }
    ctx.think("dispatching a caravan");
    ctx.event("trade", "sent a caravan of food toward a foreign settlement");
    0.008
}
