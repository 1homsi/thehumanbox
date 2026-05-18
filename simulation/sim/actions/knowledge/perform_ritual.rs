
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near {
        ctx.think("preparing a rite");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.05).min(1.0);
        o.fear_level = (o.fear_level - 0.05).max(0.0);
    }
    let bonus = 0.005 * ctx.kin.len().min(5) as f32;
    ctx.think("performing a ritual");
    ctx.discover("ritual", "led a ritual");
    bonus
}
