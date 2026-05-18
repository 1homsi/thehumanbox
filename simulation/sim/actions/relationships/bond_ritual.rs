
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 {
        ctx.think("need more kin for a bond ritual");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.06).min(1.0);
        o.boredom = (o.boredom - 0.07).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.06).min(1.0);
    let bonus = 0.005 * ctx.kin.len().min(5) as f32;
    ctx.think("performing a bond ritual");
    ctx.discover("bond_ritual", "performed a bond ritual with the group");
    ctx.event("ritual", "the group performed a bond-strengthening ritual");
    bonus + 0.008
}
