
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let season_tick = ctx.tick % 12000;
    if season_tick < 9000 { return 0.0; }
    if !ctx.fire_near { return 0.0; }
    ctx.think("gathering kin around the winter fire");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.07).min(1.0);
    }
    ctx.event("culture", "the tribe gathers around the winter fire for warmth and stories");
    0.010
}
