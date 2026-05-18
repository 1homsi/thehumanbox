//! Action 316: compose a song; reduce all kin boredom.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.08).max(0.0);
    }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.1).max(0.0);
    ctx.think("composing a song");
    ctx.discover("music_composition", "composed the first song");
    ctx.event("culture", "sang a new song for the lineage");
    0.010
}
