use super::super::ctx::ActionCtx;
pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near || ctx.org().inv_food == 0 { return 0.0; }
    let o = ctx.org_mut();
    let cur = o.tools.get("flour").copied().unwrap_or(0);
    o.tools.insert("flour".to_string(), (cur + 1).min(20));
    ctx.think("grinding grain");
    ctx.discover("milling", "ground the first grain");
    0.005
}
