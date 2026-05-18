
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.is_night() || ctx.kin.len() < 2 { return 0.0; }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.10).max(0.0);
    }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.10).max(0.0);
    ctx.think("telling stories around the circle");
    ctx.discover("circle", "held the first storytelling circle");
    ctx.event("culture", "stories were shared through the night");
    0.010
}
