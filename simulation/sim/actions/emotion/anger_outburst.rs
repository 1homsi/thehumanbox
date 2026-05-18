
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().comfort > 0.3 {
        ctx.think("keeping it together");
        return 0.0;
    }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort - 0.03).max(0.0);
    }
    ctx.think("furious");
    ctx.event("emotion", "erupted in anger, unsettling everyone nearby");
    0.003
}
