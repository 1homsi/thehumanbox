use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("no water source to feed a pond");
        return 0.0;
    }
    ctx.think("digging a basin and letting it fill");
    ctx.discover("pond_digging", "dug a pond to store water and attract fish");
    ctx.event("build", "excavated a pond fed by a nearby water source");
    0.010
}
