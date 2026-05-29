use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.fear_level = (o.fear_level - 0.08).max(0.0);
        o.comfort = (o.comfort + 0.03).min(1.0);
    }
    let bonus = 0.005 * ctx.kin.len().min(6) as f32;
    ctx.think("rallying the tribe");
    if ctx.kin.len() >= 3 {
        ctx.discover("warband", "rallied a warband");
    }
    bonus
}
