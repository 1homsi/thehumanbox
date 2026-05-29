use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.water_near && ctx.org().carry_room() > 0 {
        let o = ctx.org_mut();
        o.inv_water = o.inv_water.saturating_add(2);
        ctx.think("filling a canteen");
        0.008
    } else {
        ctx.think("seeking water to carry");
        0.0
    }
}
