//! Action 488: memorialize the dead with kin; all comfort +0.04; emit "death"; discover "memorial".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    ctx.think("gathering to honor those we have lost");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.04).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.04).min(1.0);
    ctx.event("death", "the tribe gathers to memorialize the fallen");
    ctx.discover("memorial", "held the first memorial gathering for the dead");
    0.010
}
