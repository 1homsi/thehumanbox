use super::super::ctx::ActionCtx;
use rand::RngExt;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("experimenting");
    if ctx.chance(0.06) {
        const INV: [&str; 4] = ["tinkering", "invention", "engineering", "chemistry"];
        let pick = INV[ctx.sim.rng.random_range(0..INV.len())];
        ctx.discover(pick, "stumbled on something new");
        0.02
    } else {
        0.002
    }
}
