use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("no kin to bond with");
        return 0.0;
    };
    let oid = ctx.sim.organisms[ki].id.clone();
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(oid.clone()).or_insert(0.0);
        *t = (*t + 0.15).min(1.0);
        me.comfort = (me.comfort + 0.06).min(1.0);
    }
    {
        let my_id = ctx.sim.organisms[ctx.idx].id.clone();
        let o = &mut ctx.sim.organisms[ki];
        let t = o.org_trust.entry(my_id).or_insert(0.0);
        *t = (*t + 0.15).min(1.0);
        o.comfort = (o.comfort + 0.06).min(1.0);
    }
    ctx.think("pledging friendship");
    ctx.discover("friendship_pledge", "pledged deep friendship with a kin");
    0.010
}
