
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("needs natural landmarks to establish borders");
        return 0.0;
    }
    ctx.think("marking tribal borders");
    ctx.discover("borders", "established formal territorial borders using natural landmarks");
    ctx.event("governance", "demarcated tribal territory along rocky boundaries");
    // Use rock outcrop as anchor — claim a wide area around this position
    let lid = ctx.lid.clone();
    ctx.sim.claim_territory(&lid, ctx.ix, ctx.iy, 6);
    0.040
}
