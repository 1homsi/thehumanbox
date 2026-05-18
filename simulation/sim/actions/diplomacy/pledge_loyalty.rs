//! Action 190: pledge loyalty to first kin. Asymmetric trust bump.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("loyal in spirit");
        return 0.0;
    };
    let oid   = ctx.sim.organisms[ki].id.clone();
    let my_id = ctx.sim.organisms[ctx.idx].id.clone();
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(oid).or_insert(0.0);
        *t = (*t + 0.10).min(1.0);
    }
    {
        let them = &mut ctx.sim.organisms[ki];
        let t2 = them.org_trust.entry(my_id).or_insert(0.0);
        *t2 = (*t2 + 0.05).min(1.0);
    }
    ctx.think("pledging loyalty");
    0.005
}
