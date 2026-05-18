
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 {
        ctx.think("need more family for a council");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.03).min(1.0);
        o.boredom = (o.boredom - 0.05).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    let bonus = 0.003 * ctx.kin.len().min(5) as f32;
    ctx.think("holding a family council");
    ctx.discover("council", "held the first family council to make decisions together");
    bonus + 0.008
}
