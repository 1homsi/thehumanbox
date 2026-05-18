
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || ctx.org().inv_wood == 0 {
        ctx.think("needing wood and water");
        return 0.0;
    }
    ctx.consume_material();
    let r = ctx.craft("canoe", 0.018);
    ctx.think("hollowing a canoe");
    r
}
