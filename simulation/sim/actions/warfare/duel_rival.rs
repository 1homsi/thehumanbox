//! Action 194: duel a known rival. Both take damage.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied().find(|&k| {
        let o = &ctx.sim.organisms[k];
        o.lineage_id != lid
            && ctx.sim.organisms[ctx.idx].attitude_toward(&o.lineage_id) < -0.20
    });
    let Some(ki) = pick else {
        ctx.think("no rival in sight");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.health = (o.health - 0.08).max(0.0);
    }
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        me.health = (me.health - 0.04).max(0.0);
    }
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, -0.05);
    ctx.think("duelling a rival");
    ctx.discover("duelling", "duelled a rival");
    0.006
}
