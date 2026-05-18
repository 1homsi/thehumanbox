//! Action 511: give a lecture to 2+ kin; all boredom -0.07; emit "culture".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 { return 0.0; }
    ctx.think("addressing the tribe on matters of importance");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.07).max(0.0);
    }
    ctx.event("culture", "a public lecture is given to an attentive audience");
    0.008
}
