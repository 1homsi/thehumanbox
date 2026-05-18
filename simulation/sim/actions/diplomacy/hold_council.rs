//! Action 186: hold a council. Needs 2+ kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 {
        ctx.think("waiting on the council");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.boredom = (o.boredom - 0.04).max(0.0);
    }
    let bonus = 0.003 * ctx.kin.len().min(6) as f32;
    ctx.think("holding a council");
    ctx.discover("council", "convened a council");
    bonus
}
