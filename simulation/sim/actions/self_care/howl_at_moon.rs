use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.is_night() {
        ctx.think("waiting for the moon");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.02).min(1.0);
    }
    let bonus = 0.002 + 0.001 * ctx.kin.len().min(5) as f32;
    ctx.think("howling at the moon");
    ctx.discover("howl", "howled with the tribe");
    bonus
}
