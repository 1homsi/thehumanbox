use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("observing the turning of the sun with ancient rites");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.08).max(0.0);
    }
    ctx.org_mut().boredom = (ctx.org().boredom - 0.08).max(0.0);
    ctx.discover("solstice_ceremony", "held a formal solstice ceremony");
    ctx.event(
        "ritual",
        "the tribe performs the solstice ceremony at the turning of the sun",
    );
    0.010
}
