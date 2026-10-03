use super::super::ctx::ActionCtx;
use crate::sim::civ::trade_routes::establish_route;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let partners = super::super::deterministic_foreign_partners(ctx);
    if partners.is_empty() {
        ctx.think("no living foreign neighbor to negotiate a trade route with");
        return 0.0;
    }

    for partner_index in partners {
        let partner_lineage = ctx.sim.organisms[partner_index].lineage_id.clone();
        if establish_route(ctx.sim, ctx.idx, partner_index) {
            ctx.think(&format!("negotiating a trade route with {partner_lineage}"));
            ctx.discover("trade_route", "established a trade route with a foreign lineage");
            return 0.015;
        }
    }

    ctx.think("nearby foreign settlements already have routes or cannot support one");
    0.0
}
