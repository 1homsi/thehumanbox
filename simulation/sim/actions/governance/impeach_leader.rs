
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].is_elder);
    let Some(ki) = pick else {
        ctx.think("no elder leader to impeach");
        return 0.0;
    };
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort - 0.08).max(0.0);
    ctx.think("impeaching the leader");
    ctx.event("governance", "led an impeachment against the tribal elder");
    0.01
}
