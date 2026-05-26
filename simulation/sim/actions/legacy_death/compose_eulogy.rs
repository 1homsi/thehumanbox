use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        return 0.0;
    }
    ctx.think("finding words to honor a life well lived");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.06).max(0.0);
    }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.06).max(0.0);
    ctx.event(
        "culture",
        "a heartfelt eulogy is composed and shared with the tribe",
    );
    0.008
}
