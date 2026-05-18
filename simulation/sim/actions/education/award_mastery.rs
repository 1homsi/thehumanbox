
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    if ctx.kin.is_empty() { return 0.0; }
    let ki = ctx.kin[0];
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.08).min(1.0);
    ctx.think("recognizing true mastery when I see it");
    ctx.discover("mastery", "awarded the first recognition of mastery to a student");
    ctx.event("culture", "an elder formally awards mastery to a skilled tribesman");
    0.012
}
