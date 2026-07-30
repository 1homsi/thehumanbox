use super::super::ctx::ActionCtx;
use crate::sim::civ::trade_routes::dispatch_caravan_on_route;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if dispatch_caravan_on_route(ctx.sim, ctx.idx) {
        ctx.think("dispatching goods along an established trade route");
        return 0.008;
    }

    ctx.think("no open route has capacity for the goods currently carried");
    0.0
}
