
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    ctx.org_mut().boredom = (ctx.org().boredom - 0.08).max(0.0);
    ctx.think("recording cultural history");
    ctx.discover("cultural_record", "began recording lineage history");
    ctx.event("culture", &format!("lineage {} had its history written down", lid));
    0.012
}
