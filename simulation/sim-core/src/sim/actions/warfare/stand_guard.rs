use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.fear_level = (o.fear_level - 0.04).max(0.0);
    }
    ctx.think("standing guard");
    0.002
}
