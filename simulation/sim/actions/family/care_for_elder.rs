
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].is_elder);
    let Some(ki) = pick else {
        ctx.think("no elder to care for");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.health  = (o.health  + 0.04).min(1.0);
        o.comfort = (o.comfort + 0.05).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    ctx.think("caring for an elder");
    ctx.event("social", "lovingly cared for an elderly kin member");
    0.008
}
