
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near || ctx.org().inv_food == 0 { return 0.0; }
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().energy = (ctx.org().energy + 0.10).min(1.0);
    ctx.think("pressing oil from seeds");
    ctx.discover("oil_pressing", "pressed the first oil from plants");
    ctx.event("build", "extracted plant oil using a stone press");
    0.010
}
