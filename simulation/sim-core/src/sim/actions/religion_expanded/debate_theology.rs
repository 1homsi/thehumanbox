use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        return 0.0;
    }
    let ki = ctx.kin[0];
    ctx.sim.organisms[ki].boredom = (ctx.sim.organisms[ki].boredom - 0.08).max(0.0);
    ctx.org_mut().boredom = (ctx.org().boredom - 0.08).max(0.0);
    ctx.discover("theological_debate", "engaged in deep theological debate");
    0.010
}
