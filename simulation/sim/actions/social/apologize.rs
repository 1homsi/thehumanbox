
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.near.first() else {
        ctx.think("regretful");
        return 0.0;
    };
    let oid   = ctx.sim.organisms[ki].id.clone();
    let my_id = ctx.sim.organisms[ctx.idx].id.clone();
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(oid).or_insert(0.0);
        *t = (*t + 0.06).min(1.0);
    }
    {
        let them = &mut ctx.sim.organisms[ki];
        let t2 = them.org_trust.entry(my_id).or_insert(0.0);
        *t2 = (*t2 + 0.06).min(1.0);
    }
    ctx.think("making amends");
    0.004
}
