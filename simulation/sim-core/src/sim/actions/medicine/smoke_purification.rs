use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near {
        ctx.think("need fire for smoke purification");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.04).min(1.0);
        o.infection = (o.infection - 0.03).max(0.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.04).min(1.0);
    let bonus = 0.003 * ctx.kin.len().min(5) as f32;
    ctx.think("performing smoke purification");
    ctx.event("ritual", "purified the group with healing smoke");
    bonus + 0.005
}
