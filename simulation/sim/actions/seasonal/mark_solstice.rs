//! Action 475: mark the solstice; all kin comfort +0.05; discover "solstice_marking".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("marking the solstice with ceremony");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.05).min(1.0);
    }
    ctx.discover("solstice_marking", "marked the solstice for the first time");
    ctx.event("ritual", "the tribe gathers to mark the solstice");
    0.008
}
