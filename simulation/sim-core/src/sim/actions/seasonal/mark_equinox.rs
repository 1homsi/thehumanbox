use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("observing the balance of day and night");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.06).max(0.0);
    }
    ctx.discover("equinox_marking", "marked the equinox with communal observation");
    ctx.event("ritual", "the tribe gathers to mark the equinox");
    0.008
}
