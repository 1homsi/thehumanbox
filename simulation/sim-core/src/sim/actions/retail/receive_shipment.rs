use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.add_good("stock", 1);
    ctx.think("receive a shipment");
    ctx.event("chore", "receive a shipment");
    0.04
}
