use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.04).min(1.0);
        o.fear_level = (o.fear_level - 0.03).max(0.0);
    }
    let bonus = 0.003 * ctx.kin.len().min(5) as f32;
    ctx.think("blessing the tribe");
    bonus
}
