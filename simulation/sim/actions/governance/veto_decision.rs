
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let is_elder = ctx.sim.organisms[ctx.idx].is_elder;
    if !is_elder {
        ctx.think("lacks authority to veto");
        return 0.0;
    }
    if ctx.kin.is_empty() {
        ctx.think("no decision to veto");
        return 0.0;
    }
    ctx.think("exercising a veto");
    ctx.event("governance", "vetoed a tribal decision by elder authority");
    0.005
}
