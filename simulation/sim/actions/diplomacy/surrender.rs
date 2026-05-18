//! Action 93: surrender. Improves rep with foreign nearby, drops fear.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    for i in 0..ctx.near.len() {
        let ki = ctx.near[i];
        let their = ctx.sim.organisms[ki].lineage_id.clone();
        if their != lid {
            ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.06);
        }
    }
    ctx.org_mut().fear_level = (ctx.org().fear_level - 0.05).max(0.0);
    ctx.think("standing down");
    0.001
}
