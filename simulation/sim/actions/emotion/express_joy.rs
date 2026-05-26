use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().comfort < 0.7 {
        ctx.think("not feeling particularly joyful");
        return 0.0;
    }
    let near = ctx.near.clone();
    for ni in near {
        ctx.sim.organisms[ni].comfort = (ctx.sim.organisms[ni].comfort + 0.02).min(1.0);
    }
    ctx.think("laughing freely");
    ctx.event(
        "emotion",
        "expressed pure joy, lifting the spirits of those nearby",
    );
    0.006
}
