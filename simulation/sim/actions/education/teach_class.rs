
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 { return 0.0; }
    ctx.think("teaching the tribe what I know");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.08).max(0.0);
    }
    ctx.discover("classroom_teaching", "taught a class to multiple kin at once");
    ctx.event("culture", "a class is held for the tribe's young members");
    0.010
}
