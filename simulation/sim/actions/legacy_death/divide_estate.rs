
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    if ctx.kin.is_empty() { return 0.0; }
    let wood = ctx.org().inv_wood;
    if wood == 0 { return 0.0; }
    let share = (wood as usize / ctx.kin.len().max(1)) as u8;
    if share == 0 { return 0.0; }
    ctx.org_mut().inv_wood = wood.saturating_sub(share.saturating_mul(ctx.kin.len().min(255) as u8));
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].inv_wood = ctx.sim.organisms[ki].inv_wood.saturating_add(share);
    }
    ctx.think("dividing what I have gathered among those I leave behind");
    ctx.event("governance", "an elder divides their estate among the kin");
    0.012
}
