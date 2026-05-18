//! Action 227: give inv_wood to a nearby kin; boost trust.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_wood == 0 {
        ctx.think("nothing to offer");
        return 0.0;
    }
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("no kin nearby");
        return 0.0;
    };
    ctx.sim.organisms[ctx.idx].inv_wood -= 1;
    {
        let o = &mut ctx.sim.organisms[ki];
        o.inv_wood = o.inv_wood.saturating_add(1);
        o.comfort = (o.comfort + 0.04).min(1.0);
    }
    let oid = ctx.sim.organisms[ki].id.clone();
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(oid).or_insert(0.0);
        *t = (*t + 0.10).min(1.0);
    }
    ctx.think("gifting a tool to kin");
    ctx.event("bond", "gave tools to a kin member");
    0.007
}
