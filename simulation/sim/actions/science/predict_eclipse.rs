//! Action 425: predict an eclipse; only elders have the pattern knowledge.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder { return 0.0; }
    let lid = ctx.lid.clone();
    ctx.event("build", "calculating the next eclipse from cycles observed over a lifetime");
    ctx.event("culture", &format!("lineage {} elder prophesied an eclipse", lid));
    ctx.discover("eclipse_prediction", "predicted an eclipse for the first time");
    0.018
}
