
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick < 9000 { return 0.0; }
    if ctx.kin.is_empty() { return 0.0; }
    ctx.think("weaving tales of the past to pass the winter nights");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.09).max(0.0);
    }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.09).max(0.0);
    ctx.event("culture", "winter storytelling session around the fire");
    0.010
}
