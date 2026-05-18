//! Action 250: push a sick kin away; emit "medicine" event.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].infection > 0.1 || ctx.sim.organisms[ki].health < 0.3);
    let Some(ki) = pick else {
        ctx.think("no one needs quarantine");
        return 0.0;
    };
    // Move sick organism away slightly by nudging their position
    let dx = ctx.sim.organisms[ki].x - ctx.sim.organisms[ctx.idx].x;
    let dy = ctx.sim.organisms[ki].y - ctx.sim.organisms[ctx.idx].y;
    let dist = (dx * dx + dy * dy).sqrt().max(0.01);
    ctx.sim.organisms[ki].x += (dx / dist) * 3.0;
    ctx.sim.organisms[ki].y += (dy / dist) * 3.0;
    ctx.think("quarantining the sick");
    ctx.event("medicine", "isolated a sick kin member for quarantine");
    0.008
}
