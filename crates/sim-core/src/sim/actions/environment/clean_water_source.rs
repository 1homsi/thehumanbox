use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("no water source to clean");
        return 0.0;
    }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].health = (ctx.sim.organisms[ki].health + 0.02).min(1.0);
    }
    ctx.org_mut().health = (ctx.org().health + 0.02).min(1.0);
    ctx.think("clearing debris from the spring");
    ctx.discover("water_hygiene", "learned to keep water sources clean and safe");
    ctx.event(
        "build",
        "cleaned the water source, reducing sickness for the group",
    );
    0.012
}
