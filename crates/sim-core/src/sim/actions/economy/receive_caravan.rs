use super::super::ctx::ActionCtx;
use crate::sim::civ::trade_routes::receive_due_for_lineage;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lineage_id = ctx.lid.clone();
    if !receive_due_for_lineage(ctx.sim, &lineage_id) {
        ctx.think("no caravan has reached this lineage and is ready to unload");
        return 0.0;
    }

    ctx.think("receiving caravan goods");
    0.008
}
