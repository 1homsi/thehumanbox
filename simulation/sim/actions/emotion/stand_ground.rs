
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let stranger = ctx.near.iter().any(|&k| ctx.sim.organisms[k].lineage_id != lid);
    if !stranger {
        ctx.think("no threat to hold ground against");
        return 0.0;
    }
    ctx.org_mut().health = (ctx.org().health + 0.01).min(1.0);
    ctx.think("not backing down");
    ctx.event("social", "stood their ground against a rival, showing resolve");
    0.005
}
