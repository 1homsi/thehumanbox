use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.03).min(1.0);
    }
    let bonus = 0.003 * ctx.kin.len().min(5) as f32;
    ctx.think("reciting the ancestors");
    if !ctx.kin.is_empty() {
        ctx.discover("genealogy", "remembered the ancestors");
    }
    bonus
}
