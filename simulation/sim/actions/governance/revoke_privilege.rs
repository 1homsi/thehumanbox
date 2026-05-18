
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].comfort > 0.3);
    let Some(ki) = pick else {
        ctx.think("no kin with privileges to revoke");
        return 0.0;
    };
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort - 0.06).max(0.0);
    ctx.think("revoking privileges");
    ctx.event("governance", "stripped privileges from a tribe member");
    0.005
}
