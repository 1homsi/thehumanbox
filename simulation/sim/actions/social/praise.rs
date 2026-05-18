//! Action 82: praise the first kin nearby.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("looking for someone to praise");
        return 0.0;
    };
    let oid = ctx.sim.organisms[ki].id.clone();
    {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.05).min(1.0);
    }
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(oid).or_insert(0.0);
        *t = (*t + 0.05).min(1.0);
    }
    ctx.think("praising a friend");
    0.004
}
