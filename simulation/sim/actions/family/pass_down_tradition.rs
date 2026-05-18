//! Action 273: elder tells family history; discover "oral_tradition"; emit "culture" event.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.sim.organisms[ctx.idx].is_elder {
        ctx.think("only elders carry the old stories");
        return 0.0;
    }
    if ctx.kin.is_empty() {
        ctx.think("no family to pass traditions to");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.boredom = (o.boredom - 0.08).max(0.0);
        o.comfort = (o.comfort + 0.05).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.04).min(1.0);
    ctx.think("passing down tradition");
    ctx.discover("oral_tradition", "preserved the family history through oral tradition");
    ctx.event("culture", "the elder recounted the lineage's history");
    0.015
}
