use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.fire_near && !ctx.water_near {
        ctx.think("nothing obviously dangerous nearby");
        return 0.0;
    }
    let hazard = if ctx.fire_near { "fire" } else { "flood" };
    ctx.think("placing warning markers");
    ctx.discover("hazard_marking", "began marking dangerous areas to warn others");
    ctx.event(
        "build",
        &format!("marked a {} hazard area to keep the group safe", hazard),
    );
    0.007
}
