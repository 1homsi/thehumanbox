
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 3 {
        ctx.think("not enough tribe members to hold an election");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.04).min(1.0);
    }
    ctx.think("holding an election");
    ctx.discover("democracy", "held the tribe's first election");
    ctx.event("governance", "conducted a democratic election among kin");
    0.040
}
