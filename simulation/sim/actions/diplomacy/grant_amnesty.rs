
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    for i in 0..ctx.near.len() {
        let ki = ctx.near[i];
        let their = ctx.sim.organisms[ki].lineage_id.clone();
        if their != lid {
            ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.05);
        }
    }
    ctx.think("granting amnesty");
    ctx.discover("amnesty", "granted amnesty");
    0.004
}
