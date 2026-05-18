
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let my_id = ctx.sim.organisms[ctx.idx].id.clone();
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let oid = ctx.sim.organisms[ki].id.clone();
        {
            let me = &mut ctx.sim.organisms[ctx.idx];
            let t = me.org_trust.entry(oid).or_insert(0.0);
            *t = (*t + 0.08).min(1.0);
        }
        {
            let them = &mut ctx.sim.organisms[ki];
            let t2 = them.org_trust.entry(my_id.clone()).or_insert(0.0);
            *t2 = (*t2 + 0.08).min(1.0);
        }
    }
    let bonus = 0.003 * ctx.kin.len().min(5) as f32;
    ctx.think("swearing an oath");
    if !ctx.kin.is_empty() {
        ctx.discover("oaths", "swore a binding oath");
    }
    bonus
}
