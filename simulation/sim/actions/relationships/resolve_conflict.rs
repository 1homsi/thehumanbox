
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 {
        ctx.think("no conflict to resolve");
        return 0.0;
    }
    for i in 0..ctx.kin.len().min(2) {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.07).min(1.0);
        o.boredom = (o.boredom - 0.05).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.05).min(1.0);
    ctx.think("resolving a conflict");
    ctx.discover("conflict_resolution", "mediated and resolved a conflict between kin");
    0.012
}
