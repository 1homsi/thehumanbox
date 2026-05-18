
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.near.len() < 2 {
        ctx.think("watching for trouble");
        return 0.0;
    }
    let (a, b) = (ctx.near[0], ctx.near[1]);
    let la = ctx.sim.organisms[a].lineage_id.clone();
    let lb = ctx.sim.organisms[b].lineage_id.clone();
    if la == lb {
        ctx.think("settling a quarrel");
        return 0.0;
    }
    ctx.sim.organisms[a].update_attitude(&lb, 0.04);
    ctx.sim.organisms[b].update_attitude(&la, 0.04);
    ctx.think("mediating a dispute");
    ctx.discover("diplomacy", "brokered a peace");
    0.008
}
