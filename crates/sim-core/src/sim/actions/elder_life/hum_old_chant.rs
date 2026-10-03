use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let n = ctx.comfort_kin(0.015);
    ctx.add_comfort(0.02);
    ctx.think("hum chant");
    ctx.event("chore", "hummed an old chant");
    0.03 + n as f32 * 0.005
}
